// ==UserScript==
// @name         Match Forecast - Market Liability - Over/Under
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  This is for Kibana Dashboard to calculate the forecast for Over/Under market liability based on the goals input. The goals input should be added in the markdown body with the tag @goals.
// @author       John Wu
// @match        *://*/app/dashboards*
// @grant        none
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// ==/UserScript==

(function () {
    'use strict';

    function calculateForecast() {
        if ($("[data-type='forecast_ou']").length == 0) setupForecastTable();

        const goals = parseInt($("#goals").val());
        $("[data-type='forecast_ou']").each(function () {
            console.log("calculateForecast");

            const grid = $(this);
            let totalForecast = 0;
            let lastHandicap = 0;

            grid.find("div[role='row'],tr").each(function () {
                const row = $(this);
                const forecastCell = row.find("div.euiDataGridRowCell__truncate,td").filter(function () {
                    return $(this).text().indexOf("@forecast_ou") !== -1 || $(this).find("input[name='forecast_ou']").val();
                });
                if (forecastCell.length == 0) return;

                const cells = row.find("div[role='gridcell'],td");
                let handicap, over, under;
                if (grid.is("table")) {
                    handicap = $(cells.get(0)).text().trim();
                    over = parseFloat($(cells.get(1)).text().trim().replace(/,/g, ""));
                    under = parseFloat($(cells.get(2)).text().trim().replace(/,/g, ""));
                    forecastCell.html("<div></div>");
                } else {
                    const cellSelector = "div[data-datagrid-cellcontent='true']";
                    handicap = $(cells.get(0)).find(cellSelector).text().trim();
                    over = parseFloat($(cells.get(1)).find(cellSelector).text().trim().replace(/,/g, ""));
                    under = parseFloat($(cells.get(2)).find(cellSelector).text().trim().replace(/,/g, ""));
                }
                handicap = parseFloat((handicap === "Over Above") ? lastHandicap : handicap);
                lastHandicap = handicap + .25;
                row.css("background-color", "");

                let forecast = 0;
                if (goals == handicap + .25) forecast = over / 2;
                else if (goals == handicap - .25) forecast = under / 2;
                else if (goals > handicap) forecast = over;
                else if (goals < handicap) forecast = under;
                else {
                    forecast = 0;
                    row.css("background-color", "rgb(255, 255, 200)");
                }

                totalForecast += forecast || 0;

                forecastCell.find("div")
                    .css("color", forecast < 0 ? "rgb(253, 47, 5)" : forecast > 0 ? "rgb(6, 185, 84)" : "")
                    .text(forecast.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));

                if (!forecastCell.find("input").val())
                    forecastCell.append("<input type='hidden' name='forecast_ou' value='" + forecast + "' />");
            });

            grid.find("div[data-test-subj='lnsDataTable-footer-Forecast'],tfoot th:last()")
                .css("color", totalForecast < 0 ? "rgb(253, 47, 5)" : totalForecast > 0 ? "rgb(6, 185, 84)" : "")
                .text(totalForecast.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));

            grid.find("tfoot th:first()").text("");
            grid.find("tfoot th").each(function () {
                let forecast = parseFloat($(this).text().trim().replace(/,/g, ""));
                $(this).css("color", forecast < 0 ? "rgb(253, 47, 5)" : forecast > 0 ? "rgb(6, 185, 84)" : "")
            });
            grid.find("tfoot").css("border-top", "solid");
            grid.find("tr").each(function () { if ($(this).text().trim() == "") $(this).remove(); });
        });
    }

    function setupGoalsInput() {
        const markdownBody = $("div.kbnMarkdown__body");
        if (!markdownBody.length || $('#goals').length) return;

        let html = markdownBody.html();
        if (html.includes("@goals")) {
            html = html.replace(/@goals/g, '<input id="goals" type="number" min="0" max="10" class="euiFieldText euiFieldText--fullWidth">');
            markdownBody.html(html);
            $('#goals').on('change', calculateForecast);
            $('#goals').val(0);
        }
    }

    function setupForecastTable() {
        let intervalDivCount = 0;
        const intervalDiv = setInterval(function () {
            if ($("div[data-type='forecast_ou']").length !== 0) {
                if (intervalDivCount++ > 10) clearInterval(intervalDiv);
                return;
            }

            $("div.euiDataGrid__virtualized").filter(function () {
                return $(this).text().indexOf("@forecast_ou") !== -1;
            }).each(function () {
                $(this).attr("data-type", "forecast_ou").on("scroll", calculateForecast);
            });
            //calculateForecast();
        }, 1000);

        let intervalTableCount = 0;
        const intervalTable = setInterval(function () {
            if ($("table[data-type='forecast_ou']").length !== 0) {
                if (intervalTableCount++ > 10) clearInterval(intervalTable);
                return;
            }

            $("table.table-condensed").filter(function () {
                return $(this).text().indexOf("@forecast_ou") !== -1;
            }).each(function () {
                $(this).attr("data-type", "forecast_ou");
            });
            //calculateForecast();
        }, 1000);
    }

    // 創建一個 MutationObserver 來監視 DOM 變化
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.addedNodes.length == 0) return;
            $(mutation.addedNodes).each(function () {
                if (!$(this).is("div.kbnMarkdown__body") && !$(this).find("div.kbnMarkdown__body").length) return;

                setupGoalsInput();
                setupForecastTable();
                observer.disconnect();
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 10 * 1000);
})();
