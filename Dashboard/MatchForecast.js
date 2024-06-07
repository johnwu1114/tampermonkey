// ==UserScript==
// @name         Match Forecast
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  This is a script to calculate the forecast of Over/Under and Asian Handicap based on the score input in Kibana Markdown visualization.
// @author       John Wu
// @match        http://*.252:5601/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// ==/UserScript==

(function () {
    'use strict';

    const forecast = {
        targets: ["forecast_1x2", "forecast_ou", "forecast_ah", "forecast_cs"],
        isRendered: {},
        start: function () {
            const self = this;
            // 創建一個 MutationObserver 來監視 DOM 變化
            const observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes.length == 0) {
                        self.registerTable();
                    } else {
                        $(mutation.addedNodes).each(function () {
                            if (!$(this).is("div.kbnMarkdown__body") && !$(this).find("div.kbnMarkdown__body").length) return;

                            self.setupMarkdown();
                        });
                    }
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        },
        colorWinLoss: function (target) {
            const value = this.parseAmount(target.text());
            const color = value < 0 ? "rgb(253, 47, 5)" : value > 0 ? "rgb(6, 185, 84)" : "";
            target.css("color", color);
        },
        parseAmount: function (input) {
            return parseFloat(input.toString().trim().replace(/,/g, ""))
        },
        toAmountStr: function (input) {
            return input.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        },
        setupMarkdown: function () {
            const self = this;
            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length || $('#forecast_score').length) return;

            let html = markdownBody.html();

            self.targets.concat(["forecast"]).forEach(function (target) {
                let template = "{{" + target + "_totalForecast}}";
                if (html.includes(template)) {
                    html = html.replace(template, "<div id='" + target + "_totalForecast' />");
                    markdownBody.html(html);
                }
            });

            if (html.includes("{{forecast_score}}")) {
                html = html.replace("{{forecast_score}}", "<input id='forecast_score' type='text' class='euiFieldText euiFieldText--fullWidth'>");
                markdownBody.html(html);
                $("#forecast_score").on("change", self.render);
                $("#forecast_score").val("0-0");
                self.registerTable();
            }
        },
        registerTable: function () {
            const self = this;
            const selector = self.targets.map(function (target) { return "[data-type='" + target + "']"; }).join(",");
            if ($(selector).length !== 0) return;

            setTimeout(function () {
                console.log("registerTable");
                self.targets.forEach(function (target) {
                    $("table.table-condensed").filter(function () {
                        return $(this).html().includes("{{" + target + "}}");
                    }).each(function () {
                        console.log("register " + target);
                        $(this).attr("data-type", target);
                        self.render();
                    });
                });
            }, 1000);
        },
        render: function () {
            forecast.isRendered = {};
            forecast.render1x2();
            forecast.renderAsianHandicap();
            forecast.renderOverUnder();
            forecast.renderCorrectScore();

            let totalForecast = 0;
            forecast.targets.forEach(function (target) {
                totalForecast += forecast.parseAmount($("#" + target + "_totalForecast").text()) || 0;
            });
            forecast.colorWinLoss($("#forecast_totalForecast").text(forecast.toAmountStr(totalForecast)));
        },
        render1x2: function () {
            const self = this;
            const type = "forecast_1x2";
            const tables = $("[data-type='" + type + "']");
            if (self.isRendered[type] || tables.length === 0) return;
            self.isRendered[type] = true;

            const inputScore = $("#forecast_score").val().split("-");
            const inputScoreDiff = parseInt(inputScore[0]) - parseInt(inputScore[1]);
            tables.each(function () {
                console.log("render 1 x 2");

                const table = $(this);
                let totalForecast = 0;

                table.find("tr").each(function () {
                    const row = $(this);
                    const cells = row.find("td");
                    const forecastCell = cells.last();
                    row.css("background-color", "");
                    if (forecastCell.length == 0) return;

                    let selection = $(cells.get(0)).text().trim();
                    let stake = self.parseAmount($(cells.get(2)).text());
                    let liability = self.parseAmount($(cells.get(3)).text());
                    let cashoutWinLoss = self.parseAmount($(cells.get(4)).text());

                    let forecast = stake;
                    if ((inputScoreDiff > 0 && selection == "Home") ||
                        (inputScoreDiff < 0 && selection == "Away") ||
                        (inputScoreDiff == 0 && selection == "Draw")) {
                        forecast = liability * -1;
                        row.css("background-color", "rgb(255, 255, 200)");
                    } else {
                        forecast = stake;
                    }

                    forecast += cashoutWinLoss;
                    totalForecast += forecast || 0;

                    forecastCell.text(self.toAmountStr(forecast));
                    self.colorWinLoss(forecastCell);
                });

                table.find("tfoot th:nth-child(-n+1)").text("");
                table.find("tfoot th:last").text(self.toAmountStr(totalForecast));
                table.find("tfoot th").each(function () { self.colorWinLoss($(this)); });
                table.find("tfoot").css("border-top", "solid");
                table.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
                self.colorWinLoss($("#" + type + "_totalForecast").text(self.toAmountStr(totalForecast)));
            });
        },
        renderOverUnder: function () {
            const self = this;
            const type = "forecast_ou";
            const tables = $("[data-type='" + type + "']");
            if (self.isRendered[type] || tables.length === 0) return;
            self.isRendered[type] = true;

            const inputScore = $("#forecast_score").val().split("-");
            const inputGoals = parseInt(inputScore[0]) + parseInt(inputScore[1]);
            tables.each(function () {
                console.log("render OverUnder");

                const table = $(this);
                let totalForecast = 0;
                let lastHandicap = 0;

                table.find("tr").each(function () {
                    const row = $(this);
                    const cells = row.find("td");
                    const forecastCell = cells.last();
                    row.css("background-color", "");
                    if (forecastCell.length == 0) return;

                    let handicap = $(cells.get(0)).text().trim();
                    let overLiability = self.parseAmount($(cells.get(1)).text());
                    let underLiability = self.parseAmount($(cells.get(2)).text());
                    let cashoutWinLoss = self.parseAmount($(cells.get(3)).text());

                    handicap = self.parseAmount((handicap === "Over Above") ? lastHandicap : handicap);
                    lastHandicap = handicap + .25;

                    let forecast = 0;
                    if (inputGoals == handicap + .25) forecast = overLiability / 2;
                    else if (inputGoals == handicap - .25) forecast = underLiability / 2;
                    else if (inputGoals > handicap) forecast = overLiability;
                    else if (inputGoals < handicap) forecast = underLiability;
                    else if (inputGoals == handicap) {
                        forecast = 0;
                        row.css("background-color", "rgb(255, 255, 200)");
                    }
                    else {
                        forecastCell.css("color", "").text("");
                        return;
                    }

                    forecast += cashoutWinLoss;
                    totalForecast += forecast || 0;

                    forecastCell.text(self.toAmountStr(forecast));
                    self.colorWinLoss(forecastCell);
                });

                table.find("tfoot th:nth-child(-n+3)").text("");
                table.find("tfoot th:last").text(self.toAmountStr(totalForecast));
                table.find("tfoot th").each(function () { self.colorWinLoss($(this)); });
                table.find("tfoot").css("border-top", "solid");
                table.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
                self.colorWinLoss($("#" + type + "_totalForecast").text(self.toAmountStr(totalForecast)));
            });
        },
        renderAsianHandicap: function () {
            const self = this;
            const type = "forecast_ah";
            const tables = $("[data-type='" + type + "']");
            if (self.isRendered[type] || tables.length === 0) return;
            self.isRendered[type] = true;

            const inputScore = $("#forecast_score").val().split("-");
            const inputScoreDiff = parseInt(inputScore[0]) - parseInt(inputScore[1]);
            tables.each(function () {
                console.log("render AsianHandicap");

                const table = $(this);
                let totalForecast = 0;

                table.find("tr").each(function () {
                    const row = $(this);
                    const cells = row.find("td");
                    const forecastCell = cells.last();
                    row.css("background-color", "");
                    if (forecastCell.length == 0) return;

                    let score = $(cells.get(0)).text().trim().split("-");
                    score = score.length !== 2 ? [0, 0] : score;
                    let scoreDiff = parseInt(score[0]) - parseInt(score[1]);
                    let selection = $(cells.get(1)).text().trim();
                    let handicap = $(cells.get(2)).text().trim();
                    let homeStake = self.parseAmount($(cells.get(3)).text());
                    let awayStake = self.parseAmount($(cells.get(4)).text());
                    let homeLiability = self.parseAmount($(cells.get(5)).text());
                    let awayLiability = self.parseAmount($(cells.get(6)).text());
                    let cashoutWinLoss = self.parseAmount($(cells.get(7)).text());
                    if (handicap === "Over Above") {
                        forecastCell.text("Error!!");
                        return;
                    }
                    handicap = self.parseAmount(handicap);

                    let forecast = 0;
                    if (selection == "Home") {
                        let originalHandicap = handicap - scoreDiff;
                        let outcome = inputScoreDiff + originalHandicap;

                        if (outcome >= .5) forecast = -homeLiability;
                        else if (outcome == .25) forecast = -homeLiability / 2;
                        else if (outcome == 0) forecast = 0;
                        else if (outcome == -.25) forecast = homeStake / 2;
                        else if (outcome <= -.5) forecast = homeStake;
                    } else if (selection == "Away") {
                        let originalHandicap = handicap - scoreDiff * -1;
                        let outcome = inputScoreDiff * -1 + originalHandicap;

                        if (outcome >= .5) forecast = -awayLiability;
                        else if (outcome == .25) forecast = -awayLiability / 2;
                        else if (outcome == 0) forecast = 0;
                        else if (outcome == -.25) forecast = awayStake / 2;
                        else if (outcome <= -.5) forecast = awayStake;
                    } else {
                        forecastCell.css("color", "").text("");
                        return;
                    }

                    forecast += cashoutWinLoss;
                    totalForecast += forecast || 0;

                    forecastCell.text(self.toAmountStr(forecast));
                    self.colorWinLoss(forecastCell);
                });

                table.find("tfoot th:nth-child(-n+7)").text("");
                table.find("tfoot th:last").text(self.toAmountStr(totalForecast));
                table.find("tfoot th").each(function () { self.colorWinLoss($(this)); });
                table.find("tfoot").css("border-top", "solid");
                table.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
                self.colorWinLoss($("#" + type + "_totalForecast").text(self.toAmountStr(totalForecast)));
            });
        },
        renderCorrectScore: function () {
            const self = this;
            const type = "forecast_cs";
            const tables = $("[data-type='" + type + "']");
            if (self.isRendered[type] || tables.length === 0) return;
            self.isRendered[type] = true;

            const inputScore = $("#forecast_score").val().trim();
            tables.each(function () {
                console.log("render CorrectScore");

                const table = $(this);
                let totalForecast = 0;

                table.find("tr").each(function () {
                    const row = $(this);
                    const cells = row.find("td");
                    const forecastCell = cells.last();
                    row.css("background-color", "");
                    if (forecastCell.length == 0) return;

                    let score = $(cells.get(0)).text().trim();
                    let stake = self.parseAmount($(cells.get(2)).text());
                    let liability = self.parseAmount($(cells.get(3)).text());
                    let cashoutWinLoss = self.parseAmount($(cells.get(4)).text());

                    if (score == "") return;

                    let forecast = stake;
                    if (inputScore == score) {
                        forecast = liability * -1;
                        row.css("background-color", "rgb(255, 255, 200)");
                    }
                    forecast += cashoutWinLoss;
                    totalForecast += forecast || 0;

                    forecastCell.text(self.toAmountStr(forecast));
                    self.colorWinLoss(forecastCell);
                });

                table.find("tfoot th:nth-child(-n+1)").text("");
                table.find("tfoot th:last").text(self.toAmountStr(totalForecast));
                table.find("tfoot th").each(function () { self.colorWinLoss($(this)); });
                table.find("tfoot").css("border-top", "solid");
                table.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
                self.colorWinLoss($("#" + type + "_totalForecast").text(self.toAmountStr(totalForecast)));
            });
        }
    };

    forecast.start();
})();
