// ==UserScript==
// @name         Market Forecast V2
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Forecast market results based on the score inputted by the user in Kibana dashboard.
// @author       John Wu
// @match        http://*.252:5601/*
// @match        http://operation.uat.share.com/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @require      https://raw.githubusercontent.com/johnwu1114/tampermonkey/main/scripts/utils.js
// ==/UserScript==

(function () {
    "use strict";
    const $ = window.jQuery;

    const forecastV2 = {
        scriptName: "MarketForecastV2",
        version: "2.1",
        enabled: false,
        summaryCount: 0,
        hasScore: false,
        delayTime: 1000,
        scoreRange: 3,
        processing: undefined,
        templates: [
            { name: "Full Time", isHeader: true, pattern: "score_ft", align: "center" },
            { name: "1 x 2", scoreType: "ft", market: "1x2", align: "right", algorithm: "1x2" },
            { name: "Asian Handicap", scoreType: "ft", market: "ah", align: "right", algorithm: "ah" },
            { name: "Over / Under", scoreType: "ft", market: "ou", align: "right", algorithm: "ou" },
            { name: "Correct Score", scoreType: "ft", market: "cs", align: "right", algorithm: "cs" },
            { name: "Both Teams to Score", scoreType: "ft", market: "bts", align: "right", algorithm: "bts" },
            { name: "Team Goals Over/Under", scoreType: "ft", market: "tgou", align: "right", algorithm: "ou" },
            { name: "Half-time / Full-time", scoreType: "ft", market: "htft", align: "right", algorithm: "htft" },
            { name: "Full Time Corners", isHeader: true, pattern: "score_ft_corners", align: "center" },
            { name: "Corners: Asian Handicap", scoreType: "ft_corners", market: "ah", align: "right", algorithm: "ah" },
            { name: "Corners: Over / Under", scoreType: "ft_corners", market: "ou", align: "right", algorithm: "ou" },
            { name: "Full Time Total", isFooter: true, pattern: "ft_total", align: "right" },
            { name: "Half Time", isHeader: true, pattern: "score_ht", align: "center" },
            { name: "1 x 2", scoreType: "ht", market: "1x2", align: "right", algorithm: "1x2" },
            { name: "Asian Handicap", scoreType: "ht", market: "ah", align: "right", algorithm: "ah" },
            { name: "Over / Under", scoreType: "ht", market: "ou", align: "right", algorithm: "ou" },
            { name: "Correct Score", scoreType: "ht", market: "cs", align: "right", algorithm: "cs" },
            { name: "Both Teams to Score", scoreType: "ht", market: "bts", align: "right", algorithm: "bts" },
            { name: "Team Goals Over/Under", scoreType: "ht", market: "tgou", align: "right", algorithm: "ou" },
            { name: "Half Time Corners", isHeader: true, pattern: "score_ht_corners", align: "center" },
            { name: "Corners: Asian Handicap", scoreType: "ht_corners", market: "ah", align: "right", algorithm: "ah" },
            { name: "Corners: Over / Under", scoreType: "ht_corners", market: "ou", align: "right", algorithm: "ou" },
            { name: "Half Time Total", isFooter: true, pattern: "ht_total", align: "right" },
            { name: "Overall", isFooter: true, pattern: "total", align: "right" },
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
                } else if (mutation.target.tagName === "TBODY") {
                    clearTimeout(this.processing);
                    this.processing = setTimeout(() => {
                        this.updateScore();
                        this.setupTable();
                    }, this.delayTime);
                }
            });
        },
        checkVersion() {
            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length) {
                this.enabled = false;
                return false;
            }

            let mdScriptName = "";
            let mdVersion = "";
            markdownBody.find("code").each((_, code) => {
                const text = $(code).text().trim();
                if (text.indexOf("version") !== -1) {
                    mdVersion = text.replace("version:", "").trim();
                } else if (text.replace("script:", "").trim() === this.scriptName) {
                    mdScriptName = this.scriptName
                }
            });

            this.enabled = mdScriptName == this.scriptName;
            if (this.enabled && mdVersion > this.version) {
                markdownBody.append(
                    `<h2 style='background-color:yellow'>Update the ${this.scriptName} script to ${text} or above.</h2>` +
                    "Follow the <a target='_blank' href='https://github.com/johnwu1114/tampermonkey?tab=readme-ov-file#update-script'>document</a> to perform the update."
                );
            }

            if (this.enabled) {
                markdownBody.find("blockquote").remove();
                markdownBody.find("code").remove();
            }

            return this.enabled;
        },
        setupMarkdown() {
            if (!this.checkVersion()) return;

            // Setup markdown
            console.log("Setting up markdown...");
            const markdownBody = $("div.kbnMarkdown__body");
            markdownBody.append("<table id='forecast_table'/>");
            const table = $("#forecast_table");

            this.templates.forEach(item => {
                const { name, isHeader, isFooter, pattern, scoreType, market, align } = item;
                const row = $("<tr/>");
                row.append(`<td>${name}</td>`);
                if (isHeader) {
                    row.css("border-top", "solid").css("background-color", "#eee").css("font-weight", "bold");
                    for (let i = -this.scoreRange; i <= this.scoreRange; i++)
                        row.append(`<td style="text-align:${align}"><span id='forecast_${pattern}_${i}'>Loading...</span></td>`);
                } else if (isFooter) {
                    row.css("border-top", "solid").css("background-color", "#eee").css("font-weight", "bold");
                    for (let i = -this.scoreRange; i <= this.scoreRange; i++)
                        row.append(`<td style="text-align:${align}"><span id='forecast_${pattern}_${i}'>Loading...</span></td>`);
                }
                else {
                    for (let i = -this.scoreRange; i <= this.scoreRange; i++)
                        row.append(`<td style="text-align:${align};${(i == 0) ? "background-color:#ffc" : ""}"><span data-type='${i}_total' id='forecast_${scoreType}_${market}_${i}_total'>Loading...</span></td>`);
                }

                table.append(row);
            });

            markdownBody.append(table);
        },
        updateScore() {
            if (!this.enabled) return;

            let matchName = "";
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
                        this.setScore("forecast_score_ft", ftScore, i) && (this.hasScore = true);
                        this.setScore("forecast_score_ht", htScore, i) && (this.hasScore = true);
                        this.setScore("forecast_score_ft_corners", ftCornerScore, i) && (this.hasScore = true);
                        this.setScore("forecast_score_ht_corners", htCornerScore, i) && (this.hasScore = true);
                    }
                });
            });
        },
        setScore(key, score, scoreIndex) {
            let [homeScore, awayScore] = score.split("-").map(Number);
            if (scoreIndex < 0) homeScore += Math.abs(scoreIndex);
            else if (scoreIndex > 0) awayScore += scoreIndex;

            const newScore = `${homeScore}-${awayScore}`;
            const isScoreChanged = $(`#${key}_${scoreIndex}`).text() !== newScore;
            $(`#${key}_${scoreIndex}`).text(newScore);

            return isScoreChanged;
        },
        setupTable() {
            if (!this.enabled) return;

            console.log("Setting up forecast tables...");

            this.templates.forEach(template => {
                if (template.isHeader || template.isFooter) return;
                const target = `forecast_${template.scoreType}_${template.market}`;
                $("enhanced-paginated-table")
                    .filter((_, table) => $(table).html().includes(`{{${target}}}`))
                    .attr("data-type", target);

                for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                    this.renderTable(template.scoreType, template.market, i, this[`render_${template.algorithm}`].bind(this));
                }
            });
            this.renderTotalForecast();
        },
        renderTable(scoreType, market, scoreIndex, renderFunction) {
            const target = `forecast_${scoreType}_${market}`;
            $(`#${target}_total`).text("Loading...").css("color", "");
            const tables = $(`[data-type="${target}"]`);
            if (!tables.length) return;
            renderFunction(scoreType, market, scoreIndex, tables);
        },
        renderTotalForecast() {
            if (!this.hasScore) return;
            for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                let ftForecast = 0;
                let htForecast = 0;
                $(`[data-type='${i}_total']`).each((_, elem) => {
                    if ($(elem).attr("id").includes("_ft_"))
                        ftForecast += utils.parseAmount($(elem).text());
                    else
                        htForecast += utils.parseAmount($(elem).text());
                });
                utils.colorWinLoss($(`#forecast_ft_total_${i}`).text(utils.toAmountStr(ftForecast)));
                utils.colorWinLoss($(`#forecast_ht_total_${i}`).text(utils.toAmountStr(htForecast)));
                utils.colorWinLoss($(`#forecast_total_${i}`).text(utils.toAmountStr(ftForecast + htForecast)));
            }
        },
        render_1x2(scoreType, market, scoreIndex, tables) {
            const [homeScore, awayScore] = $(`#forecast_score_${scoreType}_${scoreIndex}`).text().split("-").map(Number);
            const forecastResult = homeScore === awayScore ? "Draw" : homeScore > awayScore ? "Home" : "Away";

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
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
                if (forecastResult === Selection) {
                    forecast = Liability * -1;
                    if (scoreIndex === 0) row.css("background-color", "#ffffc8");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_ou(scoreType, market, scoreIndex, tables) {
            const [homeScore, awayScore] = $(`#forecast_score_${scoreType}_${scoreIndex}`).text().split("-").map(Number);
            let forecastGoals = homeScore + awayScore;
            let lastHandicap = 0;

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
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
                if (Team) forecastGoals = Team === "Home" ? homeScore : awayScore;

                if (forecastGoals === Goals + 0.25) forecast = overLiability / 2;
                else if (forecastGoals === Goals - 0.25) forecast = underLiability / 2;
                else if (forecastGoals > Goals) forecast = overLiability;
                else if (forecastGoals < Goals) forecast = underLiability;
                else {
                    forecast = 0;
                    if (scoreIndex === 0) row.css("background-color", "#ffffc8");
                }

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_ah(scoreType, market, scoreIndex, tables) {
            const [homeScore, awayScore] = $(`#forecast_score_${scoreType}_${scoreIndex}`).text().split("-").map(Number);
            const forecastScoreDiff = homeScore - awayScore;

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
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
                let outcome = forecastScoreDiff + originalHandicap;
                let forecast = this.calculateAsianHandicap(outcome, HomeStake, HomeLiability);

                originalHandicap = Handicap - scoreDiff * -1;
                outcome = forecastScoreDiff * -1 + originalHandicap;
                forecast += this.calculateAsianHandicap(outcome, AwayStake, AwayLiability);

                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_cs(scoreType, market, scoreIndex, tables) {
            const forecastResult = $(`#forecast_score_${scoreType}_${scoreIndex}`).text().trim();

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
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
                if (forecastResult === Score) {
                    forecast = Liability * -1;
                    if (scoreIndex === 0) row.css("background-color", "#ffffc8");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_bts(scoreType, market, scoreIndex, tables) {
            const [homeScore, awayScore] = $(`#forecast_score_${scoreType}_${scoreIndex}`).text().split("-").map(Number);
            const isBothTeamsToScore = homeScore > 0 && awayScore > 0;

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
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
                    if (scoreIndex === 0) row.css("background-color", "#ffffc8");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        render_htft(scoreType, market, scoreIndex, tables) {
            const [ftHomeScore, ftAwayScore] = $(`#forecast_score_ft_${scoreIndex}`).text().split("-").map(Number);
            const [htHomeScore, htAwayScore] = $(`#forecast_score_ht_${scoreIndex}`).text().split("-").map(Number);
            const ftWinner = ftHomeScore === ftAwayScore ? "Draw" : ftHomeScore > ftAwayScore ? "Home" : "Away";
            const htWinner = htHomeScore === htAwayScore ? "Draw" : htHomeScore > htAwayScore ? "Home" : "Away";
            const forecastResult = `${htWinner}/${ftWinner}`;

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
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
                if (forecastResult === Selection) {
                    forecast = Liability * -1;
                    if (scoreIndex === 0) row.css("background-color", "#ffffc8");
                }
                forecast += CashOutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        processTables(scoreType, market, scoreIndex, tables, processRow) {
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

                if (scoreIndex === 0) {
                    table.find("tfoot th:last").text(utils.toAmountStr(totalForecast));
                    utils.colorWinLoss($(`#forecast_${market}_total`).text(utils.toAmountStr(totalForecast)));
                }

                if (this.hasScore)
                    utils.colorWinLoss($(`#forecast_${scoreType}_${market}_${scoreIndex}_total`).text(utils.toAmountStr(totalForecast)));

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

    forecastV2.start();
})();
