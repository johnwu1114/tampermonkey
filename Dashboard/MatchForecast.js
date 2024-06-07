// ==UserScript==
// @name         Match Forecast
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  This is a script to calculate the forecast of Over/Under and Asian Handicap based on the score input in Kibana Markdown visualization.
// @author       John Wu
// @match        http://*.252:5601/*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// ==/UserScript==

(function () {
    'use strict';

    const forecast = {
        start: function () {
            const self = this;
            // 創建一個 MutationObserver 來監視 DOM 變化
            const observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes.length == 0) return;
                    $(mutation.addedNodes).each(function () {
                        if (!$(this).is("div.kbnMarkdown__body") && !$(this).find("div.kbnMarkdown__body").length) return;

                        self.setupScoreInput();
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        },
        getWinLossColor: function (input) {
            const value = this.parseAmount(input);
            return value < 0 ? "rgb(253, 47, 5)" : value > 0 ? "rgb(6, 185, 84)" : "";
        },
        parseAmount: function (input) {
            return parseFloat(input.toString().trim().replace(/,/g, ""))
        },
        setupScoreInput: function () {
            const self = this;
            const markdownBody = $("div.kbnMarkdown__body");
            if (!markdownBody.length || $('#forecast_score').length) return;

            let html = markdownBody.html();
            if (html.includes("@forecast_score")) {
                html = html.replace(/@forecast_score/g, '<input id="forecast_score" type="text" class="euiFieldText euiFieldText--fullWidth">');
                markdownBody.html(html);
                $('#forecast_score').on('change', function () {
                    self.calculateOverUnder();
                    self.calculateAsianHandicap();
                });
                $('#forecast_score').val("0-0");

                self.setupTable();
            }
        },
        setupTable: function () {
            let intervalCount = 0;
            const interval = setInterval(function () {
                if ($("[data-type='forecast_ou']").length !== 0 && $("[data-type='forecast_ah']").length !== 0) {
                    if (intervalCount++ > 10) clearInterval(interval);
                    return;
                }

                $("table.table-condensed").filter(function () {
                    return $(this).html().includes("@forecast_ou");
                }).each(function () {
                    $(this).attr("data-type", "forecast_ou");
                });

                $("table.table-condensed").filter(function () {
                    return $(this).html().includes("@forecast_ah");
                }).each(function () {
                    $(this).attr("data-type", "forecast_ah");
                });
            }, 1000);
        },
        calculateOverUnder: function () {
            const self = this;
            if ($("[data-type='forecast_ou']").length == 0) self.setupTable();

            const inputScore = $("#forecast_score").val().split("-");
            const goals = parseInt(inputScore[0]) + parseInt(inputScore[1]);
            $("[data-type='forecast_ou']").each(function () {
                console.log("calculateOverUnder");

                const grid = $(this);
                let totalForecast = 0;
                let lastHandicap = 0;

                grid.find("tr").each(function () {
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
                    if (goals == handicap + .25) forecast = overLiability / 2;
                    else if (goals == handicap - .25) forecast = underLiability / 2;
                    else if (goals > handicap) forecast = overLiability;
                    else if (goals < handicap) forecast = underLiability;
                    else {
                        forecastCell.css("color", "").text("");
                        return;
                    }
                    
                    forecast += cashoutWinLoss;
                    totalForecast += forecast || 0;

                    forecastCell
                        .css("color", self.getWinLossColor(forecast))
                        .text(forecast.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
                });

                grid.find("tfoot th:nth-child(-n+3)").text("");
                grid.find("tfoot th:last").text(totalForecast.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
                grid.find("tfoot th").each(function () {
                    $(this).css("color", self.getWinLossColor($(this).text()))
                });
                grid.find("tfoot").css("border-top", "solid");
                grid.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
            });
        },
        calculateAsianHandicap: function () {
            const self = this;
            if ($("[data-type='forecast_ah']").length == 0) self.setupTable();

            const inputScore = $("#forecast_score").val().split("-");
            const inputScoreDiff = parseInt(inputScore[0]) - parseInt(inputScore[1]);
            $("[data-type='forecast_ah']").each(function () {
                console.log("calculateAsianHandicap");

                const grid = $(this);
                let totalForecast = 0;

                grid.find("tr").each(function () {
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

                    // if ($("#forecast_score").val().trim() == $(cells.get(0)).text().trim())
                    //     row.css("background-color", "rgb(255, 255, 200)");

                    forecast += cashoutWinLoss;
                    totalForecast += forecast || 0;

                    forecastCell
                        .css("color", self.getWinLossColor(forecast))
                        .text(forecast.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
                });

                grid.find("tfoot th:nth-child(-n+7)").text("");
                grid.find("tfoot th:last").text(totalForecast.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
                grid.find("tfoot th").each(function () {
                    $(this).css("color", self.getWinLossColor($(this).text()))
                });
                grid.find("tfoot").css("border-top", "solid");
                grid.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
            });
        }
    };

    forecast.start();
})();
