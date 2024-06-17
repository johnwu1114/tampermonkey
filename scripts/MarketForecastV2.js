// ==UserScript==
// @name         Market Forecast V2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Forecast market results based on the score inputted by the user in Kibana dashboard.
// @author       John Wu
// @match        http://*.252:5601/*
// @match        http://operation.uat.share.com/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @require      https://raw.githubusercontent.com/johnwu1114/tampermonkey/feat/scripts/utils.js
// ==/UserScript==

(function () {
    "use strict";
    const $ = window.jQuery;
    const scriptName = "MarketForecastV2";
    const version = "2.0";

    const forecast = {
        enabled: false,
        summaryCount: 0,
        lastUpdateTime: {},
        delayTime: 1000,
        scoreRange: 2,
        templates: [
            { name: "<strong>Full Time</strong>", pattern: "ft_score", align: "center", isHeader: true },
            { name: "1 x 2", pattern: "ft_1x2", align: "right", algorithm: "1x2" },
            { name: "Asian Handicap", pattern: "ft_ah", align: "right", algorithm: "ah" },
            { name: "Over / Under", pattern: "ft_ou", align: "right", algorithm: "ou" },
            { name: "Correct Score", pattern: "ft_cs", align: "right", algorithm: "cs" },
            { name: "Both Teams to Score", pattern: "ft_bts", align: "right", algorithm: "bts" },
            { name: "Team Goals Over/Under", pattern: "ft_tgou", align: "right", algorithm: "ou" },
            { name: "Half-time / Full-time", pattern: "ft_htft", align: "right", algorithm: "htft" },
            { name: "<strong>Full Time Corners</strong>", pattern: "ft_corners_score", align: "center", isHeader: true },
            { name: "Corners: Asian Handicap", pattern: "ft_corners_ah", align: "right", algorithm: "ah" },
            { name: "Corners: Over / Under", pattern: "ft_corners_ou", align: "right", algorithm: "ou" },
            { name: "<strong>Half Time</strong>", pattern: "ht_score", align: "center", isHeader: true },
            { name: "1 x 2", pattern: "ht_1x2", align: "right", algorithm: "1x2" },
            { name: "Asian Handicap", pattern: "ht_ah", align: "right", algorithm: "ah" },
            { name: "Over / Under", pattern: "ht_ou", align: "right", algorithm: "ou" },
            { name: "Correct Score", pattern: "ht_cs", align: "right", algorithm: "cs" },
            { name: "Both Teams to Score", pattern: "ht_bts", align: "right", algorithm: "bts" },
            { name: "Team Goals Over/Under", pattern: "ht_tgou", align: "right", algorithm: "ou" },
            { name: "<strong>Half Time Corners</strong>", pattern: "ht_corners_score", align: "center", isHeader: true },
            { name: "Corners: Asian Handicap", pattern: "ht_corners_ah", align: "right", algorithm: "ah" },
            { name: "Corners: Over / Under", pattern: "ht_corners_ou", align: "right", algorithm: "ou" },
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
                    this.updateScore();
                    this.setupTable();
                }
            });
        },
        checkVersion() {
            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length) {
                this.enabled = false;
                return false;
            }

            markdownBody.find("blockquote h1").remove();
            markdownBody.find("code").each((_, code) => {
                const text = $(code).text().trim();
                if (text.indexOf("version") !== -1 && text.replace("version:", "").trim() >= version) {
                    markdownBody.find("blockquote").append(
                        "<h2 style='background-color:yellow'>Update Script</h2>" +
                        "Follow the <a target='_blank' href='https://github.com/johnwu1114/tampermonkey?tab=readme-ov-file#update-script'>document</a> to perform the update."
                    );
                }
                if (text.replace("script:", "").trim() === scriptName) {
                    this.enabled = true;
                }
                $(code).remove();
            });

            return this.enabled;
        },
        setupMarkdown() {
            if (!this.checkVersion()) return;

            // Setup markdown
            console.log("Setting up markdown...");
            const markdownBody = $("div.kbnMarkdown__body");
            markdownBody.append("<table id='forecast_table'/>");
            const table = $("#forecast_table");
            table.append(`<tr><th colspan=${this.scoreRange * 2 + 2}>Forecast</th></tr>`);

            this.templates.forEach(item => {
                const { name, pattern, align, isHeader } = item;
                const row = $("<tr/>");
                if (isHeader) row.css("border-top", "solid").css("background-color", "#eee");
                row.append(`<td>${name}</td>`);
                for (let i = -this.scoreRange; i <= this.scoreRange; i++)
                    row.append(`<td style="text-align:${align};${(i == 0 && !isHeader) ? "background-color:#ffc" : ""}"><span id='forecast_${pattern}_${i}'>Loading...</span></td>`);

                table.append(row);
            });

            markdownBody.append(table);
        },
        updateScore() {
            if (!this.enabled) return;
            if (Date.now() - this.lastUpdateTime["updateScore"] < this.delayTime) return;
            this.lastUpdateTime["updateScore"] = Date.now();

            let matchName = "";
            let isScoreChanged = false;
            $(".euiFormControlLayout").each((_, elem) => {
                if ($(elem).find("label").text().trim() !== "Match") return;
                matchName = $(elem).find(".euiButtonContent [data-text]").attr("data-text");
            });
            $(".euiPanel").each((_, elem) => {
                if ($(elem).find(".embPanel__titleInner").text().trim() !== "Score Results") return;

                $(elem).find("tr").each((_, row) => {
                    if (!$(row).find("td:first").text().includes(matchName)) return;
                    const [ftScore, htScore, ftCornerScore, htCornerScore] = $(row).find("td").map((_, x) => $(x).text()).slice(1);

                    for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                        this.setScore("forecast_ft_score", ftScore, i) && (isScoreChanged = true);
                        this.setScore("forecast_ht_score", htScore, i) && (isScoreChanged = true);
                        this.setScore("forecast_ft_corners_score", ftCornerScore, i) && (isScoreChanged = true);
                        this.setScore("forecast_ht_corners_score", htCornerScore, i) && (isScoreChanged = true);
                    }
                });
            });
            console.log("Score updated...", isScoreChanged);
        },
        setScore(key, score, diff) {
            let [homeScore, awayScore] = score.split("-").map(Number);
            if (diff < 0) homeScore += Math.abs(diff);
            else if (diff > 0) awayScore += diff;

            const newScore = `${homeScore}-${awayScore}`;
            const isScoreChanged = $(`#${key}_${diff}`).text() !== newScore;
            $(`#${key}_${diff}`).text(newScore);

            return isScoreChanged;
        },
        setupTable() {
            if (!this.enabled) return;
            if (Date.now() - this.lastUpdateTime["setupTable"] < this.delayTime) return;

            // const existCount = $(this.templates.map(template => `[data-type="forecast_${template.pattern}"]`).join(",")).length;
            // const noResultsCount = $("[ng-controller='EnhancedTableVisController'] .euiText").filter((_, table) => $(table).text().trim() === "No results found").length;
            // if ((existCount + noResultsCount) >= this.summaryCount) return;
            this.lastUpdateTime["setupTable"] = Date.now();

            console.log("Setting up forecast tables...");
            setTimeout(() => {
                this.templates.forEach(template => {
                    if (!template.algorithm) return;
                    const target = `forecast_${template.pattern}`;
                    $("enhanced-paginated-table")
                        .filter((_, table) => $(table).html().includes(`{{${target}}}`))
                        .attr("data-type", target);

                    this.renderTable(template.pattern, this[`render_${template.algorithm}`].bind(this));
                });
            }, this.delayTime);
        },
        renderTable(market, renderFunction) {
            const target = `forecast_${market}`;
            $(`#${target}_total`).text("Loading...").css("color", "");
            const tables = $(`[data-type="${target}"]`);
            if (!tables.length) return;
            renderFunction(market, tables);
        },
        render_1x2(market, tables) {
            const inputKey = market.replace("_1x2", "");
            const [homeScore, awayScore] = $(`#forecast_${inputKey}_score_0`).val().split("-").map(Number);
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
                    row.css("background-color", "#ffffc8");
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
                    row.css("background-color", "#ffffc8");
                    forecast = 0;
                }

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_ah(market, tables) {
            const inputKey = market.replace("_ah", "");
            const [homeScore, awayScore] = $(`#forecast_${inputKey}_score_0`).val().split("-").map(Number);
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
                    row.css("background-color", "#ffffc8");
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
                    row.css("background-color", "#ffffc8");
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
                    row.css("background-color", "#ffffc8");
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
