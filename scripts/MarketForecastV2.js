// ==UserScript==
// @name         Market Forecast V2
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  Forecast market results based on the score inputted by the user in Kibana dashboard.
// @author       John Wu
// @match        http://*.252:5601/*
// @match        http://operation.uat.share.com/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @require      https://raw.githubusercontent.com/johnwu1114/tampermonkey/main/scripts/common.js
// @require      https://raw.githubusercontent.com/johnwu1114/tampermonkey/main/scripts/utils.js
// ==/UserScript==

(function () {
    "use strict";
    const $ = window.jQuery;

    const forecastV2 = {
        scriptName: "MarketForecastV2",
        version: "2.8",
        enabled: false,
        summaryCount: 0,
        hasScore: false,
        delayTime: 1000,
        scoreRange: 3,
        processing: undefined,
        latestUpdate: 0,
        fixedHt: false,
        fixedFt: false,
        templates: [
            { name: "Full Time", isBold: true, isColspan: true, align: "center" },
            { name: "Full Time", isBold: true, pattern: "score_ft", align: "center" },
            { name: "1 x 2", scoreType: "ft", market: "1x2", algorithm: "1x2", align: "right" },
            { name: "Asian Handicap", scoreType: "ft", market: "ah", algorithm: "ah", align: "right" },
            { name: "Over / Under", scoreType: "ft", market: "ou", algorithm: "ou", align: "right" },
            { name: "Correct Score", scoreType: "ft", market: "cs", algorithm: "cs", align: "right" },
            { name: "Both Teams to Score", scoreType: "ft", market: "bts", algorithm: "bts", align: "right" },
            { name: "Team Goals Over/Under", scoreType: "ft", market: "tgou", algorithm: "ou", align: "right" },
            { name: "Half-time / Full-time", scoreType: "ft", market: "htft", algorithm: "htft", align: "right" },
            { name: "Full Time Corners", isBold: true, pattern: "score_ft_corners", align: "center" },
            { name: "Corners: Asian Handicap", scoreType: "ft_corners", market: "ah", algorithm: "ah", align: "right" },
            { name: "Corners: Over / Under", scoreType: "ft_corners", market: "ou", algorithm: "ou", align: "right" },
            { name: "Full Time Total", isBold: true, pattern: "total_ft", align: "right" },

            { name: "Half Time", isBold: true, isColspan: true, align: "center" },
            { name: "Half Time", isBold: true, pattern: "score_ht", align: "center" },
            { name: "1 x 2", scoreType: "ht", market: "1x2", algorithm: "1x2", align: "right" },
            { name: "Asian Handicap", scoreType: "ht", market: "ah", algorithm: "ah", align: "right" },
            { name: "Over / Under", scoreType: "ht", market: "ou", algorithm: "ou", align: "right" },
            { name: "Correct Score", scoreType: "ht", market: "cs", algorithm: "cs", align: "right" },
            { name: "Both Teams to Score", scoreType: "ht", market: "bts", algorithm: "bts", align: "right" },
            { name: "Team Goals Over/Under", scoreType: "ht", market: "tgou", algorithm: "ou", align: "right" },
            { name: "Half Time Corners", isBold: true, pattern: "score_ht_corners", align: "center" },
            { name: "Corners: Asian Handicap", scoreType: "ht_corners", market: "ah", algorithm: "ah", align: "right" },
            { name: "Corners: Over / Under", scoreType: "ht_corners", market: "ou", algorithm: "ou", align: "right" },
            { name: "Half Time Total", isBold: true, pattern: "total_ht", align: "right" },

            { name: "Extra Time", isBold: true, isColspan: true, align: "center", isExtraTime: true },
            { name: "Extra Time", isBold: true, pattern: "score_et", align: "center", isExtraTime: true },
            { name: "1 x 2", scoreType: "et", market: "1x2", algorithm: "1x2", align: "right", isExtraTime: true },
            { name: "Asian Handicap", scoreType: "et", market: "ah", algorithm: "ah", align: "right", isExtraTime: true },
            { name: "Over / Under", scoreType: "et", market: "ou", algorithm: "ou", align: "right", isExtraTime: true },
            { name: "Team Goals Over/Under", scoreType: "et", market: "tgou", algorithm: "ou", align: "right", isExtraTime: true },
            { name: "Extra Time Corners", isBold: true, pattern: "score_et_corners", align: "center", isExtraTime: true },
            { name: "Corners: Over / Under", scoreType: "et_corners", market: "ou", algorithm: "ou", align: "right", isExtraTime: true },
            { name: "Penalty (Inc. Death)", isBold: true, pattern: "score_et_penalty", align: "center", isExtraTime: true },
            { name: "Over / Under", scoreType: "et_penalty", market: "ou", algorithm: "ou", align: "right", isExtraTime: true },
            { name: "Extra Time Total", isBold: true, pattern: "total_et", align: "right", isExtraTime: true },

            { name: "Overall", isBold: true, pattern: "total", align: "right" }
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
                            this.enabled = common.checkVersion(this.scriptName, this.version);
                            if (this.enabled) this.setupMarkdown();
                        }
                    });
                } else if (this.enabled && mutation.target.tagName === "TBODY") {
                    this.clearTable();
                    clearTimeout(this.processing);
                    this.processing = setTimeout(() => {
                        this.updateScore();
                        this.setupTable();
                    }, this.delayTime);
                }
            });
        },
        setupMarkdown() {
            console.log("Setting up markdown...");
            const markdownBody = $("div.kbnMarkdown__body");
            markdownBody.append("<table id='forecast_summary'/>");
            const table = $("#forecast_summary");

            this.templates.forEach(item => {
                const { name, isBold, isColspan, pattern, scoreType, market, align, isExtraTime } = item;
                const row = $(`<tr data-extra-time='${isExtraTime}'>`);

                if (isBold) row.css("border-top", "solid").css("background-color", "#eee").css("font-weight", "bold");

                if (isColspan) {
                    row.append(`<td colspan='${this.scoreRange * 2 + 2}' style="text-align:${align}">${name}</td>`);
                } else {
                    row.append(`<td>${name}</td>`);
                    for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                        if (pattern) {
                            row.append(`<td style="text-align:${align}"><span id='forecast_${pattern}_${i}'>Loading...</span></td>`);
                        }
                        else {
                            const background = (i === 0) ? "background-color:#ffc" : "";
                            row.append(`<td style="text-align:${align};${background}"><span data-total='${i}' id='forecast_total_${scoreType}_${market}_${i}'>Loading...</span></td>`);
                        }
                    }
                }

                table.append(row);
            });

            markdownBody.append(table);
        },
        updateScore() {
            let matchName = "";
            $(".euiFormControlLayout").each((_, elem) => {
                if ($(elem).find("label").text().trim() !== "Match") return;
                matchName = $(elem).find(".euiButtonContent [data-text]").attr("data-text");
            });
            $("div.euiPanel").each((_, elem) => {
                const title = $(elem).find(".embPanel__titleText").text().trim();
                if (title.includes("FT")) {
                    $(elem).css("background-color", "#efe");
                } else if (title.includes("HT")) {
                    $(elem).css("background-color", "#eef");
                } else if (title.includes("ET")) {
                    $(elem).css("background-color", "#fee");
                }

                if (title !== "Score Results") return;

                const headers = $(elem).find("thead th").map((_, th) => $(th).text().trim()).get();
                $(elem).find("tbody tr").each((_, row) => {
                    if (!$(row).find("td:first").text().includes(matchName)) {
                        $(row).hide();
                        return;
                    }
                    let cells = {};
                    $(row).find("td").each((index, cell) => {
                        cells[index] = cells[headers[index]] = $(cell).text().trim();
                    });
                    const timer = parseInt(cells["Timer"].replace(":", ""));
                    this.fixedHt = timer > 4500;
                    this.fixedFt = timer > 9000;
                    for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                        this.setScore("forecast_score_ft", cells["Full Time"], i) && (this.hasScore = true);
                        this.setScore("forecast_score_ht", cells["Half Time"], i) && (this.hasScore = true);
                        this.setScore("forecast_score_ft_corners", cells["Full Time Corner"], i) && (this.hasScore = true);
                        this.setScore("forecast_score_ht_corners", cells["Half Time Corner"], i) && (this.hasScore = true);
                        this.setScore("forecast_score_et", cells["Extra Full Time"], i) && (this.hasScore = true);
                        this.setScore("forecast_score_et_corners", cells["Extra Full Time Corner"], i) && (this.hasScore = true);
                        this.setScore("forecast_score_et_penalty", cells["Penalty (Inc. Death)"], i) && (this.hasScore = true);
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
        clearTable() {
            if (Date.now() < this.latestUpdate + this.delayTime) return;
            console.log("Clearing forecast tables...");
            $("#forecast_summary td span").text("Loading...").css("color", "");
            this.latestUpdate = Date.now();
        },
        setupTable() {
            console.log("Setting up forecast tables...");

            this.templates.forEach(template => {
                if (template.isBold) return;
                const target = `forecast_${template.scoreType}_${template.market}`;
                $("enhanced-paginated-table")
                    .filter((_, table) => $(table).html().includes(`{{${target}}}`))
                    .attr("data-type", target);

                for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                    const score = $(`#forecast_score_${template.scoreType}_${i}`).text().trim();
                    const [homeScore, awayScore] = score.split("-").map(Number);
                    switch (template.algorithm) {
                        case "ah":
                            this.renderTable(template.scoreType, template.market, i, this.renderAsianHandicap.bind(this));
                            break;
                        case "ou":
                            this.renderTable(template.scoreType, template.market, i, this.renderOverUnder.bind(this));
                            break;
                        case "1x2":
                            this.renderTable(template.scoreType, template.market, i, this.renderSingleOutcome.bind(this), () => {
                                return homeScore === awayScore ? "Draw" : homeScore > awayScore ? "Home" : "Away";
                            });
                            break;
                        case "cs":
                            this.renderTable(template.scoreType, template.market, i, this.renderSingleOutcome.bind(this), () => score);
                            break;
                        case "bts":
                            this.renderTable(template.scoreType, template.market, i, this.renderSingleOutcome.bind(this), () => {
                                return homeScore > 0 && awayScore > 0 ? "Yes" : "No";
                            });
                            break;
                        case "htft":
                            this.renderTable(template.scoreType, template.market, i, this.renderSingleOutcome.bind(this), () => {
                                const [ftHomeScore, ftAwayScore] = $(`#forecast_score_ft_${i}`).text().split("-").map(Number);
                                const [htHomeScore, htAwayScore] = $(`#forecast_score_ht_${i}`).text().split("-").map(Number);
                                const ftWinner = ftHomeScore === ftAwayScore ? "Draw" : ftHomeScore > ftAwayScore ? "Home" : "Away";
                                const htWinner = htHomeScore === htAwayScore ? "Draw" : htHomeScore > htAwayScore ? "Home" : "Away";
                                return `${htWinner}/${ftWinner}`;
                            });
                            break;
                    }
                }
            });
            this.renderTotalForecast();
        },
        renderTable(scoreType, market, scoreIndex, renderFunc, outcomeFunc) {
            const target = `${scoreType}_${market}`;
            $(`#forecast_total_${target}`).text("Loading...").css("color", "");
            const tables = $(`[data-type="forecast_${target}"]`);
            if (!tables.length) return;
            renderFunc(scoreType, market, scoreIndex, tables, outcomeFunc);
        },
        renderTotalForecast() {
            if (!this.hasScore) return;
            for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                let ftForecast = 0;
                let htForecast = 0;
                let etForecast = 0;
                $(`[data-total='${i}']`).each((_, elem) => {
                    if ($(elem).attr("id").includes("_ft_"))
                        ftForecast += utils.parseAmount($(elem).text());
                    else if ($(elem).attr("id").includes("_ht_"))
                        htForecast += utils.parseAmount($(elem).text());
                    else if ($(elem).attr("id").includes("_et_"))
                        etForecast += utils.parseAmount($(elem).text());
                });
                utils.colorWinLoss($(`#forecast_total_ft_${i}`).text(utils.toAmountStr(ftForecast)));
                utils.colorWinLoss($(`#forecast_total_ht_${i}`).text(utils.toAmountStr(htForecast)));
                utils.colorWinLoss($(`#forecast_total_et_${i}`).text(utils.toAmountStr(etForecast)));
                utils.colorWinLoss($(`#forecast_total_${i}`).text(utils.toAmountStr(ftForecast + htForecast + etForecast)));
            }

            if (this.fixedFt) {
                $(`tr[data-extra-time="true"]`).show();
            } else {
                $(`tr[data-extra-time="true"]`).hide();
            }

            if (!this.fixedHt && !this.fixedFt) return;

            for (let i = -this.scoreRange; i <= this.scoreRange; i++) {
                if (i === 0) continue;
                const ftForecast = utils.parseAmount($(`#forecast_total_ft_${this.fixedFt ? 0 : i}`).text());
                const htForecast = utils.parseAmount($(`#forecast_total_ht_0`).text());
                const etForecast = utils.parseAmount($(`#forecast_total_et_${i}`).text());
                $(`#forecast_total_ht_${i}`).text("");
                if (this.fixedFt) $(`#forecast_total_ft_${i}`).text("");
                utils.colorWinLoss($(`#forecast_total_${i}`).text(utils.toAmountStr(ftForecast + htForecast + etForecast)));
            }
        },
        renderSingleOutcome(scoreType, market, scoreIndex, tables, outcomeFunc) {
            const outcome = outcomeFunc();

            this.processTables(scoreType, market, scoreIndex, tables, (row, cells) => {
                let {
                    Selection,
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

                let forecast = Stake;
                Selection = Selection ?? Score;
                if (outcome === Selection) {
                    forecast = Liability * -1;
                    if (scoreIndex === 0) row.css("background-color", "#ffffc8");
                }
                forecast += CashOutWinLoss;
                if (scoreIndex === 0) utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderOverUnder(scoreType, market, scoreIndex, tables) {
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
                if (scoreIndex === 0) utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderAsianHandicap(scoreType, market, scoreIndex, tables) {
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
                let forecast = common.calculateAsianHandicap(outcome, HomeStake, HomeLiability);

                originalHandicap = Handicap - scoreDiff * -1;
                outcome = forecastScoreDiff * -1 + originalHandicap;
                forecast += common.calculateAsianHandicap(outcome, AwayStake, AwayLiability);

                forecast += CashOutWinLoss;
                if (scoreIndex === 0) utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        processTables(scoreType, market, scoreIndex, tables, processRow) {
            tables.each((_, elem) => {
                const table = $(elem);
                let totalForecast = 0;

                const headers = table.find("thead th").map((_, th) => $(th).text().trim()).get();
                table.find("tr").each((_, row) => {
                    if ($(row).text().trim() === "") {
                        $(row).remove();
                        return;
                    }

                    let cells = {};
                    if (scoreIndex === 0) $(row).css("background-color", "");
                    $(row).find("td").each((index, cell) => {
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
                    utils.colorWinLoss($(`#forecast_total_${market}`).text(utils.toAmountStr(totalForecast)));
                }

                if (scoreIndex !== 0 && ((this.fixedHt && scoreType.includes("ht")) || (this.fixedFt && scoreType.includes("ft")))) {
                    $(`#forecast_score_${scoreType}_${scoreIndex}`).text("");
                    $(`#forecast_total_${scoreType}_${market}_${scoreIndex}`).text("");
                }
                else {
                    utils.colorWinLoss($(`#forecast_total_${scoreType}_${market}_${scoreIndex}`).text(utils.toAmountStr(totalForecast)));
                }

                // Hide void and cashout columns
                [
                    "Void Stake", "CashOut Stake", "Liability", "CashOut WinLoss",
                    "Over Stake", "Over Void Stake", "Over CashOut Stake", "Over Liability",
                    "Under Stake", "Under Void Stake", "Under CashOut Stake", "Under Liability",
                    "Home Stake", "Home Void Stake", "Home CashOut Stake", "Home Liability",
                    "Away Stake", "Away Void Stake", "Away CashOut Stake", "Away Liability"
                ].forEach(colName => {
                    const colNum = headers.indexOf(colName) + 1;
                    if (colNum === 0) return;
                    table.find("tr").find(`th:nth-child(${colNum}),td:nth-child(${colNum})`).hide();
                });

                // Color win/loss columns
                ["Forecast"].forEach(colName => {
                    const colNum = headers.indexOf(colName) + 1;
                    if (colNum === 0) return;
                    table.find("tr").find(`th:nth-child(${colNum}),td:nth-child(${colNum})`)
                        .each((_, td) => utils.colorWinLoss($(td)));
                });
            });
        }
    };

    forecastV2.start();
})();
