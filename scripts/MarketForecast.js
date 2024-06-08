// ==UserScript==
// @name         Market Forecast
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Forecast the markets based on the score inputted and the table data in the dashboard.
// @author       John Wu
// @match        http://*.252:5601/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// ==/UserScript==

(function () {
    "use strict";
    const $ = window.jQuery;

    const utils = {
        colorWinLoss(target) {
            const value = this.parseAmount(target.text());
            target.css("color", value < 0 ? "rgb(253, 47, 5)" : value > 0 ? "rgb(6, 185, 84)" : "");
        },
        parseAmount(input) {
            const parsed = parseFloat(input.toString().trim().replace(/,/g, ""));
            return isNaN(parsed) ? 0 : parsed;
        },
        toAmountStr(input) {
            return input.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    };

    const forecast = {
        targets: ["forecast_1x2", "forecast_ou", "forecast_ah", "forecast_cs"],
        isRendered: {},
        registeredTime: 0,
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
            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length || $("#forecast_score").length) return;

            console.log("Setting up markdown...");
            let html = markdownBody.html();
            this.targets.concat(["forecast"]).forEach(target => {
                html = html.replace(`{{${target}_totalForecast}}`, `<div id="${target}_totalForecast" />`);
            });
            html = html.replace("{{forecast_score}}", "<input id='forecast_score' type='text' class='euiFieldText euiFieldText--fullWidth'>");
            markdownBody.html(html);
            $("#forecast_score").on("change", this.render.bind(this)).val("0-0");

            markdownBody.find("blockquote").remove();
        },
        setupTable() {
            if (Date.now() - this.registeredTime < 1000 || $(this.targets.map(type => `[data-type="${type}"]`).join(",")).length !== 0) return;
            this.registeredTime = Date.now();

            console.log("Setting up forecast tables...");
            setTimeout(() => {
                this.targets.forEach(target => {
                    $(`table.table-condensed`)
                        .filter((_, table) => $(table).html().includes(`{{${target}}}`))
                        .attr("data-type", target);
                });
                this.render();
            }, 1000);
        },
        render() {
            console.log("Rendering forecast...");
            this.isRendered = {};
            this.renderTable("forecast_1x2", this.render1x2.bind(this));
            this.renderTable("forecast_ou", this.renderOverUnder.bind(this));
            this.renderTable("forecast_ah", this.renderAsianHandicap.bind(this));
            this.renderTable("forecast_cs", this.renderCorrectScore.bind(this));

            const totalForecast = this.targets.reduce((total, target) => total + (utils.parseAmount($(`#${target}_totalForecast`).text()) || 0), 0);
            utils.colorWinLoss($("#forecast_totalForecast").text(utils.toAmountStr(totalForecast)));
        },
        renderTable(type, renderFunction) {
            const tables = $(`[data-type="${type}"]`);
            if (this.isRendered[type] || !tables.length) return;
            this.isRendered[type] = true;
            renderFunction(tables);
        },
        render1x2(tables) {
            const [homeScore, awayScore] = $("#forecast_score").val().split("-").map(Number);
            const inputScoreDiff = homeScore - awayScore;
            this.processTables("forecast_1x2", tables, (row, cells) => {
                let {
                    Selection,
                    Stake,
                    Liability,
                    "CashOut WinLoss": cashoutWinLoss
                } = cells;
                Stake = utils.parseAmount(Stake);
                Liability = utils.parseAmount(Liability);
                cashoutWinLoss = utils.parseAmount(cashoutWinLoss);
                let forecast = Stake;
                if ((inputScoreDiff > 0 && Selection === "Home") ||
                    (inputScoreDiff < 0 && Selection === "Away") ||
                    (inputScoreDiff === 0 && Selection === "Draw")) {
                    forecast = Liability * -1;
                    row.css("background-color", "rgb(255, 255, 200)");
                }
                forecast += cashoutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderOverUnder(tables) {
            const [homeScore, awayScore] = $("#forecast_score").val().split("-").map(Number);
            const inputGoals = homeScore + awayScore;
            let lastHandicap = 0;
            this.processTables("forecast_ou", tables, (row, cells) => {
                let {
                    Handicap,
                    "Over Stake": OverStake,
                    "Over Liability": OverLiability,
                    "Under Stake": UnderStake,
                    "Under Liability": UnderLiability,
                    "CashOut WinLoss": cashoutWinLoss
                } = cells;
                Handicap = utils.parseAmount(Handicap === "Over Above" ? lastHandicap : Handicap);
                cashoutWinLoss = utils.parseAmount(cashoutWinLoss);
                lastHandicap = Handicap + 0.25;
                const overLiability = (utils.parseAmount(OverLiability) - utils.parseAmount(UnderStake)) * -1;
                const underLiability = (utils.parseAmount(UnderLiability) - utils.parseAmount(OverStake)) * -1;

                let forecast = 0;
                if (inputGoals === Handicap + 0.25) forecast = overLiability / 2;
                else if (inputGoals === Handicap - 0.25) forecast = underLiability / 2;
                else if (inputGoals > Handicap) forecast = overLiability;
                else if (inputGoals < Handicap) forecast = underLiability;
                else {
                    row.css("background-color", "rgb(255, 255, 200)");
                    forecast = 0;
                }

                forecast += cashoutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderAsianHandicap(tables) {
            const [homeScore, awayScore] = $("#forecast_score").val().split("-").map(Number);
            const inputScoreDiff = homeScore - awayScore;
            this.processTables("forecast_ah", tables, (row, cells) => {
                let {
                    Score,
                    Handicap,
                    "Home Stake": homeStake,
                    "Away Stake": awayStake,
                    "Home Liability": homeLiability,
                    "Away Liability": awayLiability,
                    "CashOut WinLoss": cashoutWinLoss
                } = cells;
                homeStake = utils.parseAmount(homeStake);
                awayStake = utils.parseAmount(awayStake);
                homeLiability = utils.parseAmount(homeLiability);
                awayLiability = utils.parseAmount(awayLiability);
                cashoutWinLoss = utils.parseAmount(cashoutWinLoss);
                const scoreDiff = Score.indexOf("-") === -1 ? 0 : Score.split("-").map(Number).reduce((a, b) => a - b, 0);
                if (Handicap === "Over Above") {
                    row.find("td:last").text("Error!!");
                    return;
                }

                let originalHandicap = Handicap - scoreDiff;
                let outcome = inputScoreDiff + originalHandicap;
                let forecast = this.calculateAsianHandicap(outcome, homeStake, homeLiability);

                originalHandicap = Handicap - scoreDiff * -1;
                outcome = inputScoreDiff * -1 + originalHandicap;
                forecast += this.calculateAsianHandicap(outcome, awayStake, awayLiability);

                forecast += cashoutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        renderCorrectScore(tables) {
            const inputScore = $("#forecast_score").val().trim();
            this.processTables("forecast_cs", tables, (row, cells) => {
                let {
                    Score,
                    Stake,
                    Liability,
                    "CashOut WinLoss": cashoutWinLoss
                } = cells;
                Stake = utils.parseAmount(Stake);
                Liability = utils.parseAmount(Liability);
                cashoutWinLoss = utils.parseAmount(cashoutWinLoss);
                if (!Score) return null;

                let forecast = Stake;
                if (inputScore === Score) {
                    forecast = Liability * -1;
                    row.css("background-color", "rgb(255, 255, 200)");
                }
                forecast += cashoutWinLoss;
                utils.colorWinLoss(row.find("td:last").text(utils.toAmountStr(forecast)));
                return forecast;
            });
        },
        processTables(type, tables, processRow) {
            let totalForecast = 0;
            tables.each((_, table) => {
                const headers = $(table).find("thead th").map((_, th) => $(th).text().trim()).get();
                $(table).find("tr").each((_, row) => {
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

                this.updateTableFooter($(table), totalForecast);
                utils.colorWinLoss($(`#${type}_totalForecast`).text(utils.toAmountStr(totalForecast)));
            });
        },
        updateTableFooter(table, totalForecast) {
            table.find("tbody td").each((_, td) => {
                if ($(td).text().trim() === "0.00")$(td).find("div").text("0");
            });
            table.find("tfoot th:nth-child(-n+1)").text("");
            table.find("tfoot th:last").text(utils.toAmountStr(totalForecast));
            table.find("tfoot th:nth-last-child(-n+2)").each((_, th) => utils.colorWinLoss($(th)));
            table.find("tfoot").css("border-top", "solid");
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
