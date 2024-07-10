const common = {
    checkVersion(scriptName, version) {
        const markdownBody = $("div.kbnMarkdown__body");
        if (!markdownBody.length) return false;

        let mdScriptName = "";
        let mdVersion = "";
        markdownBody.find("code").each((_, code) => {
            const text = $(code).text().trim();
            if (text.indexOf("version:") !== -1) {
                mdVersion = text.replace("version:", "").trim();
            } else if (text.replace("script:", "").trim() === scriptName) {
                mdScriptName = scriptName
            }
        });

        const enabled = mdScriptName == scriptName;
        if (enabled && this.padVersion(mdVersion) > this.padVersion(version)) {
            markdownBody.append(
                `<h2 style='background-color:yellow'>Update the ${scriptName} script to ${mdVersion} or above.</h2>` +
                "Follow the <a target='_blank' href='https://github.com/johnwu1114/tampermonkey?tab=readme-ov-file#update-script'>document</a> to perform the update."
            );
        }

        if (enabled) {
            markdownBody.find("blockquote").remove();
            markdownBody.find("code").remove();
        }

        return enabled;
    },
    calculateAsianHandicap(outcome, stake, liability) {
        if (outcome >= 0.5) return -liability;
        if (outcome === 0.25) return -liability / 2;
        if (outcome === 0) return 0;
        if (outcome === -0.25) return stake / 2;
        if (outcome <= -0.5) return stake;
        return 0;
    },
    padVersion(version) {
        return version.split(".").map(x => x.padStart(10, "0")).join("");
    }
};
