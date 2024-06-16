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
        registeredTime: 0,
        delayTime: 1000,
        inputs: ["ft", "ft_corners", "ht", "ht_corners"],
        strategies: [
            { market: "ft_1x2", algorithm: "1x2" },
            { market: "ft_ou", algorithm: "ou" },
            { market: "ft_ah", algorithm: "ah" },
            { market: "ft_cs", algorithm: "cs" },
            { market: "ft_bts", algorithm: "bts" },
            { market: "ft_tgou", algorithm: "ou" },
            { market: "ft_corners_ou", algorithm: "ou" },
            { market: "ft_corners_ah", algorithm: "ah" },
            { market: "ft_htft", algorithm: "htft" },
            { market: "ht_1x2", algorithm: "1x2" },
            { market: "ht_ou", algorithm: "ou" },
            { market: "ht_ah", algorithm: "ah" },
            { market: "ht_cs", algorithm: "cs" },
            { market: "ht_bts", algorithm: "bts" },
            { market: "ht_tgou", algorithm: "ou" },
            { market: "ht_corners_ou", algorithm: "ou" },
            { market: "ht_corners_ah", algorithm: "ah" },
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
        checkVersion() {
            let supportVersion = "0";
            const markdownBody = $("div.kbnMarkdown__body");
            markdownBody.find("blockquote h1").remove();
            markdownBody.find("blockquote h2").remove(); // Temporarily remove the update script message
            markdownBody.find("code").each((_, code) => {
                const text = $(code).text().trim();
                if (text.indexOf("version") === -1) return;
                $(code).remove();
                supportVersion = text.replace("version:", "").trim();
            });
            if (version >= supportVersion) return;

            markdownBody.find("blockquote").append(
                "<h2 style='background-color:yellow'>Update Script</h2>" +
                "Follow the <a target='_blank' href='https://github.com/johnwu1114/tampermonkey?tab=readme-ov-file#update-script'>document</a> to perform the update."
            );
        },
        setupMarkdown() {
            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length) {
                this.enabled = false;
                return;
            }

            this.checkVersion();

            // Setup markdown
            console.log("Setting up markdown...");
            let html = markdownBody.html();
            this.inputs.forEach(inputName => {
                html = html.replace(`{{forecast_${inputName}_score}}`, `<input id='forecast_${inputName}_score' type='text' class='euiFieldText' />`);
            });
            this.strategies.forEach(strategy => {
                html = html.replace(`{{forecast_${strategy.market}_total}}`, `<span id="forecast_${strategy.market}_total" />`);
            });
            html = html
                .replace(`{{forecast_ft_total}}`, `<span id="forecast_ft_total" />`)
                .replace(`{{forecast_ht_total}}`, `<span id="forecast_ht_total" />`)
                .replace(`{{forecast_total}}`, `<span id="forecast_total" />`);
            markdownBody.html(html);

            this.inputs.forEach(inputName => {
                $(`#forecast_${inputName}_score`).on("change", this[`render_${inputName}`].bind(this)).val("0-0");
            });

            this.summaryCount = $(this.strategies.map(strategy => `#forecast_${strategy.market}_total`).join(",")).length;

            this.enabled = true;
        },
        setupTable() {
            if (!this.enabled) return;
            if (Date.now() - this.registeredTime < this.delayTime) return;

            const existCount = $(this.strategies.map(strategy => `[data-type="forecast_${strategy.market}"]`).join(",")).length;
            const noResultsCount = $("[ng-controller='EnhancedTableVisController'] .euiText").filter((_, table) => $(table).text().trim() === "No results found").length;
            if ((existCount + noResultsCount) >= this.summaryCount) return;

            this.registeredTime = Date.now();

            console.log("Setting up forecast tables...");
            setTimeout(() => {
                this.strategies.forEach(strategy => {
                    const target = `forecast_${strategy.market}`;
                    $("enhanced-paginated-table")
                        .filter((_, table) => $(table).html().includes(`{{${target}}}`))
                        .attr("data-type", target);
                });
                this.inputs.forEach(inputName => this[`render_${inputName}`]());
            }, this.delayTime);
        },
        renderTotalForecast() {
            let fullTimeTotal = 0;
            let halfTimeTotal = 0;
            this.strategies.forEach(strategy => {
                const forecast = utils.parseAmount($(`#forecast_${strategy.market}_total`).text());
                if (strategy.market.includes("ft_")) fullTimeTotal += forecast;
                else halfTimeTotal += forecast;
            });
            utils.colorWinLoss($("#forecast_ft_total").text(utils.toAmountStr(fullTimeTotal)));
            utils.colorWinLoss($("#forecast_ht_total").text(utils.toAmountStr(halfTimeTotal)));
            utils.colorWinLoss($("#forecast_total").text(utils.toAmountStr(fullTimeTotal + halfTimeTotal)));
        },
        renderTable(market, renderFunction) {
            const target = `forecast_${market}`;
            $(`#${target}_total`).text("Loading...").css("color", "");
            const tables = $(`[data-type="${target}"]`);
            if (!tables.length) return;
            renderFunction(market, tables);
        },
        render_ft() {
            console.log("Rendering forecast by full time score...");
            this.strategies.filter(strategy => strategy.market.includes("ft_") && !strategy.market.includes("corners_"))
                .forEach(strategy => {
                    this.renderTable(strategy.market, this[`render_${strategy.algorithm}`].bind(this));
                });
            this.renderTotalForecast();
        },
        render_ft_corners() {
            console.log("Rendering forecast by full time corners...");
            this.strategies.filter(strategy => strategy.market.includes("ft_") && strategy.market.includes("corners_"))
                .forEach(strategy => {
                    this.renderTable(strategy.market, this[`render_${strategy.algorithm}`].bind(this));
                });
            this.renderTotalForecast();
        },
        render_ht() {
            console.log("Rendering forecast by half time score...");
            this.strategies.filter(strategy => strategy.market.includes("ht_") && !strategy.market.includes("corners_"))
                .forEach(strategy => {
                    this.renderTable(strategy.market, this[`render_${strategy.algorithm}`].bind(this));
                });
            this.renderTable("ft_htft", this.render_htft.bind(this));
            this.renderTotalForecast();
        },
        render_ht_corners() {
            console.log("Rendering forecast by half time corners...");
            this.strategies.filter(strategy => strategy.market.includes("ht_") && strategy.market.includes("corners_"))
                .forEach(strategy => {
                    this.renderTable(strategy.market, this[`render_${strategy.algorithm}`].bind(this));
                });
            this.renderTotalForecast();
        },
        render_1x2(market, tables) {
            const inputKey = market.replace("_1x2", "");
            const [homeScore, awayScore] = $(`#forecast_${inputKey}_score`).val().split("-").map(Number);
            const winner = homeScore === awayScore ? "Draw" : homeScore > awayScore ? "Home" : "Away";
            this.processTables(market, tables, (row, cells) => {
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
        render_ou(market, tables) {
            const inputKey = market.replace("_ou", "").replace("_tgou", "");
            const [homeScore, awayScore] = $(`#forecast_${inputKey}_score`).val().split("-").map(Number);
            let inputScore = homeScore + awayScore;
            let lastHandicap = 0;
            this.processTables(market, tables, (row, cells) => {
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
                if (Team) inputScore = Team === "Home" ? homeScore : awayScore;

                if (inputScore === Goals + 0.25) forecast = overLiability / 2;
                else if (inputScore === Goals - 0.25) forecast = underLiability / 2;
                else if (inputScore > Goals) forecast = overLiability;
                else if (inputScore < Goals) forecast = underLiability;
                else {
                    row.css("background-color", "rgb(255, 255, 200)");
                    forecast = 0;
                }

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_ah(market, tables) {
            const inputKey = market.replace("_ah", "");
            const [homeScore, awayScore] = $(`#forecast_${inputKey}_score`).val().split("-").map(Number);
            const inputScoreDiff = homeScore - awayScore;
            this.processTables(market, tables, (row, cells) => {
                let {
                    Score,
                    "Corners Score": CornersScore,
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
                Score = Score || CornersScore || "0-0";
                const scoreDiff = Score.indexOf("-") === -1 ? 0 : Score.split("-").map(Number).reduce((a, b) => a - b);
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
        render_cs(market, tables) {
            const inputKey = market.replace("_cs", "");
            const inputScore = $(`#forecast_${inputKey}_score`).val().trim();
            this.processTables(market, tables, (row, cells) => {
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
        render_bts(market, tables) {
            const inputKey = market.replace("_bts", "");
            const [homeScore, awayScore] = $(`#forecast_${inputKey}_score`).val().split("-").map(Number);
            const isBothTeamsToScore = homeScore > 0 && awayScore > 0;
            this.processTables(market, tables, (row, cells) => {
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
        render_htft(market, tables) {
            const [ftHomeScore, ftAwayScore] = $(`#forecast_ft_score`).val().split("-").map(Number);
            const [htHomeScore, htAwayScore] = $(`#forecast_ht_score`).val().split("-").map(Number);
            const ftWinner = ftHomeScore === ftAwayScore ? "Draw" : ftHomeScore > ftAwayScore ? "Home" : "Away";
            const htWinner = htHomeScore === htAwayScore ? "Draw" : htHomeScore > htAwayScore ? "Home" : "Away";
            const inputHtft = `${htWinner}/${ftWinner}`;

            this.processTables(market, tables, (row, cells) => {
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
        processTables(market, tables, processRow) {
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
                utils.colorWinLoss($(`#forecast_${market}_total`).text(utils.toAmountStr(totalForecast)));

                // Hide void and cashout columns
                [
                    "Void Stake", "CashOut Stake", "Liability", "CashOut WinLoss",
                    "Over Stake", "Over Void Stake", "Over CashOut Stake", "Over Liability",
                    "Under Stake", "Under Void Stake", "Under CashOut Stake", "Under Liability",
                    "Home Stake", "Home Void Stake", "Home CashOut Stake", "Home Liability",
                    "Away Stake", "Away Void Stake", "Away CashOut Stake", "Away Liability"
                ].forEach(colName => {
                    const colNum = headers.indexOf(colName) + 1;
                    if (colNum == 0) return;
                    table.find("tr").find(`th:nth-child(${colNum}),td:nth-child(${colNum})`).hide();
                });

                // Color win/loss columns
                ["CashOut WinLoss", "Forecast"].forEach(colName => {
                    const colNum = headers.indexOf(colName) + 1;
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
