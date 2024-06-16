// ==UserScript==
// @name         Market Forecast
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Forecast market results based on the score inputted by the user in Kibana dashboard.
// @author       John Wu
// @match        http://*.252:5601/*
// @match        http://operation.uat.share.com/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// ==/UserScript==

(function () {
    "use strict";
    const $ = window.jQuery;
    const version = "1.7";

    const utils = {
        colorWinLoss(target) {
            const value = this.parseAmount(target.text());
            target.css("color", value < 0 ? "rgb(253, 47, 5)" : value > 0 ? "rgb(6, 185, 84)" : "");
        },
        parseAmount(input) {
            const parsed = parseFloat((input || 0).toString().trim().replace(/,/g, ""));
            return isNaN(parsed) ? 0 : parsed;
        },
        toAmountStr(input) {
            return input.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    };

    const forecast = {
        enabled: false,
        summaryCount: 0,
        isRendered: {},
        registeredTime: 0,
        delayTime: 1000,
        targets: [
            "forecast_ft_1x2",
            "forecast_ft_ou",
            "forecast_ft_ah",
            "forecast_ft_cs",
            "forecast_ft_bts",
            "forecast_ft_tgou",
            "forecast_ft_corners_ou",
            "forecast_ft_corners_ah",
            "forecast_ft_htft",
            "forecast_ht_1x2",
            "forecast_ht_ou",
            "forecast_ht_ah",
            "forecast_ht_cs",
            "forecast_ht_bts",
            "forecast_ht_tgou",
            "forecast_ht_corners_ou",
            "forecast_ht_corners_ah",
        ],
        start() {
            const observer = new MutationObserver(this.observeMutations.bind(this));
            observer.observe(document.body, { childList: true, subtree: true });
        },
        observeMutations(mutations) {
            if (window.location.pathname.indexOf("/app/dashboards") === -1) return;

            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    $(mutation.addedNodes).each((_, addedNode) => {
                        if ($(addedNode).is("div.kbnMarkdown__body") || $(addedNode).find("div.kbnMarkdown__body").length) {
                            this.setupMarkdown();
                        }
                    });
                } else {
                    this.setupTable();
                }
            });
        },
        setupMarkdown() {
            if (this.enabled) return;

            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length) return;

            // Check version
            let supportVersion = "0";
            markdownBody.find("blockquote h1").remove();
            markdownBody.find("blockquote h2").remove(); // Temporarily remove the update script message
            markdownBody.find("code").each((_, code) => {
                const text = $(code).text().trim();
                if (text.indexOf("version") === -1) return;
                $(code).remove();
                supportVersion = text.replace("version:", "").trim();
            });
            if (version < supportVersion) {
                markdownBody.find("blockquote").append("<h2 style='background-color:yellow'>Update Script</h2>" +
                    "Follow the <a target='_blank' href='https://github.com/johnwu1114/tampermonkey?tab=readme-ov-file#update-script'>document</a> to perform the update."
                );
            }

            // Setup markdown
            console.log("Setting up markdown...");
            let html = markdownBody.html();
            let inputs = ["forecast_ft_score", "forecast_ft_corners_score", "forecast_ht_score", "forecast_ht_corners_score"];
            inputs.forEach(name => {
                html = html.replace(`{{${name}}}`, `<input id='${name}' type='text' class='euiFieldText' />`);
            });
            this.targets.concat(["forecast_ft", "forecast_ht", "forecast"]).forEach(name => {
                html = html.replace(`{{${name}_total}}`, `<span id="${name}_total" />`);
            });
            markdownBody.html(html);

            $("#forecast_ft_score").on("change", this["renderByFullTimeScore"].bind(this)).val("0-0");
            $("#forecast_ft_corners_score").on("change", this["renderByFullTimeCorners"].bind(this)).val("0-0");
            $("#forecast_ht_score").on("change", this["renderByHalfTimeScore"].bind(this)).val("0-0");
            $("#forecast_ht_corners_score").on("change", this["renderByHalfTimeCorners"].bind(this)).val("0-0");

            this.summaryCount = $(this.targets.map(name => `#${name}_total`).join(",")).length;

            this.enabled = true;
        },
        setupTable() {
            if (!this.enabled) return;
            if (Date.now() - this.registeredTime < this.delayTime) return;

            const existCount = $(this.targets.map(name => `[data-type="${name}"]`).join(",")).length;
            const noResultsCount = $("[ng-controller='EnhancedTableVisController'] .euiText").filter((_, table) => $(table).text().trim() === "No results found").length;
            if ((existCount + noResultsCount) >= this.summaryCount) return;

            this.registeredTime = Date.now();

            console.log("Setting up forecast tables...");
            setTimeout(() => {
                this.targets.forEach(name => {
                    $("enhanced-paginated-table")
                        .filter((_, table) => $(table).html().includes(`{{${name}}}`))
                        .attr("data-type", name);
                });
                this.renderByFullTimeScore();
                this.renderByFullTimeCorners();
                this.renderByHalfTimeScore();
                this.renderByHalfTimeCorners();
            }, this.delayTime);
        },
        renderTotalForecast() {
            let fullTimeTotal = 0;
            let halfTimeTotal = 0;
            this.targets.forEach(target => {
                const forecast = utils.parseAmount($(`#${target}_total`).text());
                if (target.includes("_ft_")) fullTimeTotal += forecast;
                else halfTimeTotal += forecast;
            });
            utils.colorWinLoss($("#forecast_ft_total").text(utils.toAmountStr(fullTimeTotal)));
            utils.colorWinLoss($("#forecast_ht_total").text(utils.toAmountStr(halfTimeTotal)));
            utils.colorWinLoss($("#forecast_total").text(utils.toAmountStr(fullTimeTotal + halfTimeTotal)));
        },
        renderByFullTimeScore() {
            console.log("Rendering forecast by full time score...");
            this.isRendered = {};
            this.renderTable("ft", "1x2", this.render1x2.bind(this));
            this.renderTable("ft", "ou", this.renderOverUnder.bind(this));
            this.renderTable("ft", "ah", this.renderAsianHandicap.bind(this));
            this.renderTable("ft", "cs", this.renderCorrectScore.bind(this));
            this.renderTable("ft", "bts", this.renderBothTeamsToScore.bind(this));
            this.renderTable("ft", "tgou", this.renderTeamGoalsOverUnder.bind(this));
            this.renderTable("ft", "htft", this.renderHalftTimeFullTime.bind(this));
            this.renderTotalForecast();
        },
        renderByFullTimeCorners() {
            console.log("Rendering forecast by full time corners...");
            this.isRendered = {};
            this.renderTable("ft", "corners_ou", this.renderCornersOverUnder.bind(this));
            this.renderTable("ft", "corners_ah", this.renderCornersAsianHandicap.bind(this));
            this.renderTotalForecast();
        },
        renderByHalfTimeScore() {
            console.log("Rendering forecast by half time score...");
            this.isRendered = {};
            this.renderTable("ht", "1x2", this.render1x2.bind(this));
            this.renderTable("ht", "ou", this.renderOverUnder.bind(this));
            this.renderTable("ht", "ah", this.renderAsianHandicap.bind(this));
            this.renderTable("ht", "cs", this.renderCorrectScore.bind(this));
            this.renderTable("ht", "bts", this.renderBothTeamsToScore.bind(this));
            this.renderTable("ht", "tgou", this.renderTeamGoalsOverUnder.bind(this));
            this.renderTable("ft", "htft", this.renderHalftTimeFullTime.bind(this));
            this.renderTotalForecast();
        },
        renderByHalfTimeCorners() {
            console.log("Rendering forecast by half time corners...");
            this.isRendered = {};
            this.renderTable("ht", "corners_ou", this.renderCornersOverUnder.bind(this));
            this.renderTable("ht", "corners_ah", this.renderCornersAsianHandicap.bind(this));
            this.renderTotalForecast();
        },
        renderTable(ftht, type, renderFunction) {
            const key = `forecast_${ftht}_${type}`;
            utils.colorWinLoss($(`#${key}_total`).text("0"));
            const tables = $(`[data-type="${key}"]`);
            if (this.isRendered[key] || !tables.length) return;
            this.isRendered[key] = true;
            renderFunction(ftht, type, tables);
        },
        render1x2(ftht, type, tables) {
            const [homeScore, awayScore] = $(`#forecast_${ftht}_score`).val().split("-").map(Number);
            const winner = homeScore === awayScore ? "Draw" : homeScore > awayScore ? "Home" : "Away";
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Selection,
                    "Void Stake": VoidStake,
                    "CashOut Stake": CashOutStake,
                    Stake,
                    Liability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                Stake = utils.parseAmount(Stake) - utils.parseAmount(VoidStake) - utils.parseAmount(CashOutStake);
                Liability = utils.parseAmount(Liability);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                let forecast = Stake;
                if (winner === Selection) {
                    forecast = Liability * -1;
                    row.css("background-color", "rgb(255, 255, 200)");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderOverUnder(ftht, type, tables) {
            const [homeScore, awayScore] = $(`#forecast_${ftht}_score`).val().split("-").map(Number);
            const inputGoals = homeScore + awayScore;
            let lastHandicap = 0;
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Goals,
                    "Over Stake": OverStake,
                    "Over Void Stake": OverVoidStake,
                    "Over CashOut Stake": OverCashOutStake,
                    "Over Liability": OverLiability,
                    "Under Stake": UnderStake,
                    "Under Void Stake": UnderVoidStake,
                    "Under CashOut Stake": UnderCashOutStake,
                    "Under Liability": UnderLiability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                OverStake = utils.parseAmount(OverStake) - utils.parseAmount(OverVoidStake) - utils.parseAmount(OverCashOutStake);
                UnderStake = utils.parseAmount(UnderStake) - utils.parseAmount(UnderVoidStake) - utils.parseAmount(UnderCashOutStake);
                Goals = utils.parseAmount(Goals === "Over Above" ? lastHandicap : Goals);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                lastHandicap = Goals + 0.25;
                const overLiability = (utils.parseAmount(OverLiability) - utils.parseAmount(UnderStake)) * -1;
                const underLiability = (utils.parseAmount(UnderLiability) - utils.parseAmount(OverStake)) * -1;

                let forecast = 0;
                if (inputGoals === Goals + 0.25) forecast = overLiability / 2;
                else if (inputGoals === Goals - 0.25) forecast = underLiability / 2;
                else if (inputGoals > Goals) forecast = overLiability;
                else if (inputGoals < Goals) forecast = underLiability;
                else {
                    row.css("background-color", "rgb(255, 255, 200)");
                    forecast = 0;
                }

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderAsianHandicap(ftht, type, tables) {
            const [homeScore, awayScore] = $(`#forecast_${ftht}_score`).val().split("-").map(Number);
            const inputScoreDiff = homeScore - awayScore;
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Score,
                    Handicap,
                    "Home Stake": HomeStake,
                    "Home Void Stake": HomeVoidStake,
                    "Home CashOut Stake": HomeCashOutStake,
                    "Away Stake": AwayStake,
                    "Away Void Stake": AwayVoidStake,
                    "Away CashOut Stake": AwayCashOutStake,
                    "Home Liability": HomeLiability,
                    "Away Liability": AwayLiability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                HomeStake = utils.parseAmount(HomeStake) - utils.parseAmount(HomeVoidStake) - utils.parseAmount(HomeCashOutStake);
                AwayStake = utils.parseAmount(AwayStake) - utils.parseAmount(AwayVoidStake) - utils.parseAmount(AwayCashOutStake);
                HomeLiability = utils.parseAmount(HomeLiability);
                AwayLiability = utils.parseAmount(AwayLiability);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                const scoreDiff = Math.abs(Score.indexOf("-") === -1 ? 0 : Score.split("-").map(Number).reduce((a, b) => a - b, 0));
                if (Handicap === "Over Above") {
                    row.find("td:last").text("Error!!");
                    return;
                }

                Handicap = utils.parseAmount(Handicap);
                let originalHandicap = Handicap - scoreDiff;
                let outcome = inputScoreDiff + originalHandicap;
                let forecast = this.calculateAsianHandicap(outcome, HomeStake, HomeLiability);

                originalHandicap = Handicap - scoreDiff * -1;
                outcome = inputScoreDiff * -1 + originalHandicap;
                forecast += this.calculateAsianHandicap(outcome, AwayStake, AwayLiability);

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderCorrectScore(ftht, type, tables) {
            const inputScore = $(`#forecast_${ftht}_score`).val().trim();
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Score,
                    Stake,
                    "Void Stake": VoidStake,
                    "CashOut Stake": CashOutStake,
                    Liability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                Stake = utils.parseAmount(Stake) - utils.parseAmount(VoidStake) - utils.parseAmount(CashOutStake);
                Liability = utils.parseAmount(Liability);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                if (!Score) return null;

                let forecast = Stake;
                if (inputScore === Score) {
                    forecast = Liability * -1;
                    row.css("background-color", "rgb(255, 255, 200)");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderBothTeamsToScore(ftht, type, tables) {
            const [homeScore, awayScore] = $(`#forecast_${ftht}_score`).val().split("-").map(Number);
            const isBothTeamsToScore = homeScore > 0 && awayScore > 0;
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Selection,
                    "Void Stake": VoidStake,
                    "CashOut Stake": CashOutStake,
                    Stake,
                    Liability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                Stake = utils.parseAmount(Stake) - utils.parseAmount(VoidStake) - utils.parseAmount(CashOutStake);
                Liability = utils.parseAmount(Liability);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);

                let forecast = Stake;
                if ((isBothTeamsToScore && Selection === "Yes") ||
                    (!isBothTeamsToScore && Selection === "No")) {
                    forecast = Liability * -1;
                    row.css("background-color", "rgb(255, 255, 200)");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderTeamGoalsOverUnder(ftht, type, tables) {
            const [homeScore, awayScore] = $(`#forecast_${ftht}_score`).val().split("-").map(Number);
            let lastHandicap = 0;
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Goals,
                    Team,
                    "Over Stake": OverStake,
                    "Over Void Stake": OverVoidStake,
                    "Over CashOut Stake": OverCashOutStake,
                    "Over Liability": OverLiability,
                    "Under Stake": UnderStake,
                    "Under Void Stake": UnderVoidStake,
                    "Under CashOut Stake": UnderCashOutStake,
                    "Under Liability": UnderLiability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                OverStake = utils.parseAmount(OverStake) - utils.parseAmount(OverVoidStake) - utils.parseAmount(OverCashOutStake);
                UnderStake = utils.parseAmount(UnderStake) - utils.parseAmount(UnderVoidStake) - utils.parseAmount(UnderCashOutStake);
                Goals = utils.parseAmount(Goals === "Over Above" ? lastHandicap : Goals);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                lastHandicap = Goals + 0.25;
                const overLiability = (utils.parseAmount(OverLiability) - utils.parseAmount(UnderStake)) * -1;
                const underLiability = (utils.parseAmount(UnderLiability) - utils.parseAmount(OverStake)) * -1;

                let forecast = 0;
                const goals = Team === "Home" ? homeScore : awayScore;
                if (goals === Goals + 0.25) forecast = overLiability / 2;
                else if (goals === Goals - 0.25) forecast = underLiability / 2;
                else if (goals > Goals) forecast = overLiability;
                else if (goals < Goals) forecast = underLiability;
                else {
                    row.css("background-color", "rgb(255, 255, 200)");
                    forecast = 0;
                }

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderCornersOverUnder(ftht, type, tables) {
            const [homeCornersScore, awayCornersScore] = $(`#forecast_${ftht}_corners_score`).val().split("-").map(Number);
            const inputCorners = homeCornersScore + awayCornersScore;
            let lastHandicap = 0;
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Goals,
                    "Over Stake": OverStake,
                    "Over Void Stake": OverVoidStake,
                    "Over CashOut Stake": OverCashOutStake,
                    "Over Liability": OverLiability,
                    "Under Stake": UnderStake,
                    "Under Void Stake": UnderVoidStake,
                    "Under CashOut Stake": UnderCashOutStake,
                    "Under Liability": UnderLiability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                OverStake = utils.parseAmount(OverStake) - utils.parseAmount(OverVoidStake) - utils.parseAmount(OverCashOutStake);
                UnderStake = utils.parseAmount(UnderStake) - utils.parseAmount(UnderVoidStake) - utils.parseAmount(UnderCashOutStake);
                Goals = utils.parseAmount(Goals === "Over Above" ? lastHandicap : Goals);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                lastHandicap = Goals + 0.25;
                const overLiability = (utils.parseAmount(OverLiability) - utils.parseAmount(UnderStake)) * -1;
                const underLiability = (utils.parseAmount(UnderLiability) - utils.parseAmount(OverStake)) * -1;

                let forecast = 0;
                if (inputCorners === Goals + 0.25) forecast = overLiability / 2;
                else if (inputCorners === Goals - 0.25) forecast = underLiability / 2;
                else if (inputCorners > Goals) forecast = overLiability;
                else if (inputCorners < Goals) forecast = underLiability;
                else {
                    row.css("background-color", "rgb(255, 255, 200)");
                    forecast = 0;
                }

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderCornersAsianHandicap(ftht, type, tables) {
            const [homeCornersScore, awayCornersScore] = $(`#forecast_${ftht}_corners_score`).val().split("-").map(Number);
            const inputScoreDiff = homeCornersScore - awayCornersScore;
            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    "Corners Score": Score,
                    Handicap,
                    "Home Stake": HomeStake,
                    "Home Void Stake": HomeVoidStake,
                    "Home CashOut Stake": HomeCashOutStake,
                    "Away Stake": AwayStake,
                    "Away Void Stake": AwayVoidStake,
                    "Away CashOut Stake": AwayCashOutStake,
                    "Home Liability": HomeLiability,
                    "Away Liability": AwayLiability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                HomeStake = utils.parseAmount(HomeStake) - utils.parseAmount(HomeVoidStake) - utils.parseAmount(HomeCashOutStake);
                AwayStake = utils.parseAmount(AwayStake) - utils.parseAmount(AwayVoidStake) - utils.parseAmount(AwayCashOutStake);
                HomeLiability = utils.parseAmount(HomeLiability);
                AwayLiability = utils.parseAmount(AwayLiability);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);
                const scoreDiff = Math.abs(Score.indexOf("-") === -1 ? 0 : Score.split("-").map(Number).reduce((a, b) => a - b, 0));
                if (Handicap === "Over Above") {
                    row.find("td:last").text("Error!!");
                    return;
                }

                Handicap = utils.parseAmount(Handicap);
                let originalHandicap = Handicap - scoreDiff;
                let outcome = inputScoreDiff + originalHandicap;
                let forecast = this.calculateAsianHandicap(outcome, HomeStake, HomeLiability);

                originalHandicap = Handicap - scoreDiff * -1;
                outcome = inputScoreDiff * -1 + originalHandicap;
                forecast += this.calculateAsianHandicap(outcome, AwayStake, AwayLiability);

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderHalftTimeFullTime(ftht, type, tables) {
            const [ftHomeScore, ftAwayScore] = $(`#forecast_ft_score`).val().split("-").map(Number);
            const [htHomeScore, htAwayScore] = $(`#forecast_ht_score`).val().split("-").map(Number);
            const ftWinner = ftHomeScore === ftAwayScore ? "Draw" : ftHomeScore > ftAwayScore ? "Home" : "Away";
            const htWinner = htHomeScore === htAwayScore ? "Draw" : htHomeScore > htAwayScore ? "Home" : "Away";
            const inputHtft = `${htWinner}/${ftWinner}`;

            this.processTables(ftht, type, tables, (row, cells) => {
                let {
                    Selection,
                    Stake,
                    "Void Stake": VoidStake,
                    "CashOut Stake": CashOutStake,
                    Liability,
                    "CashOut WinLoss": CashOutWinLoss
                } = cells;
                Stake = utils.parseAmount(Stake) - utils.parseAmount(VoidStake) - utils.parseAmount(CashOutStake);
                Liability = utils.parseAmount(Liability);
                CashOutWinLoss = utils.parseAmount(CashOutWinLoss);


                let forecast = Stake;
                if (inputHtft === Selection) {
                    forecast = Liability * -1;
                    row.css("background-color", "rgb(255, 255, 200)");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        processTables(ftht, type, tables, processRow) {
            tables.each((_, tab) => {
                const table = $(tab);
                let totalForecast = 0;

                const headers = table.find("thead th").map((_, th) => $(th).text().trim()).get();
                table.find("tr").each((_, row) => {
                    if ($(row).text().trim() === "") {
                        $(row).remove();
                        return;
                    }

                    let cells = {};
                    $(row).css("background-color", "").find("td").each((index, cell) => {
                        cells[index] = cells[headers[index]] = $(cell).text().trim();
                    });
                    if (!Object.keys(cells).length) return;

                    const forecast = processRow($(row), cells);
                    if (forecast !== null) totalForecast += forecast;
                });

                table.find("tfoot th:nth-child(-n+1)").text("");
                table.find("tfoot").css("border-top", "solid");
                table.find("tbody td").each((_, td) => {
                    if ($(td).text().trim() === "0.00") $(td).find("div").text("0");
                });
                table.find("tfoot th:last").text(utils.toAmountStr(totalForecast));
                utils.colorWinLoss($(`#forecast_${ftht}_${type}_total`).text(utils.toAmountStr(totalForecast)));

                // Hide void and cashout columns
                [
                    "Void Stake", "CashOut Stake", "Liability", "CashOut WinLoss",
                    "Over Stake", "Over Void Stake", "Over CashOut Stake", "Over Liability",
                    "Under Stake", "Under Void Stake", "Under CashOut Stake", "Under Liability",
                    "Home Stake", "Home Void Stake", "Home CashOut Stake", "Home Liability",
                    "Away Stake", "Away Void Stake", "Away CashOut Stake", "Away Liability"
                ].forEach(name => {
                    const colNum = headers.indexOf(name) + 1;
                    if (colNum == 0) return;
                    table.find("tr").find(`th:nth-child(${colNum}),td:nth-child(${colNum})`).hide();
                });

                // Color win/loss columns
                ["CashOut WinLoss", "Forecast"].forEach(name => {
                    const colNum = headers.indexOf(name) + 1;
                    if (colNum == 0) return;
                    table.find("tr").find(`th:nth-child(${colNum}),td:nth-child(${colNum})`)
                        .each((_, td) => utils.colorWinLoss($(td)));
                });
            });
        },
        calculateAsianHandicap(outcome, stake, liability) {
            if (outcome >= 0.5) return -liability;
            if (outcome === 0.25) return -liability / 2;
            if (outcome === 0) return 0;
            if (outcome === -0.25) return stake / 2;
            if (outcome <= -0.5) return stake;
            return 0;
        }
    };

    forecast.start();
})();
