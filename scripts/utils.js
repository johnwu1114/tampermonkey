const utils = {
    colorWinLoss(target) {
        const value = this.parseAmount(target.text());
        target.css("color", value < 0 ? "#fd2f05" : value > 0 ? "#06b954" : "");
    },
    parseAmount(input) {
        const parsed = parseFloat((input || 0).toString().trim().replace(/,/g, ""));
        return isNaN(parsed) ? 0 : parsed;
    },
    toAmountStr(input) {
        return input.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
};