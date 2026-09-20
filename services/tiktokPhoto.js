import { createBrowser } from "../lib/browser.js";
import {
    BROWSER_USER_AGENT,
    NAVIGATION_TIMEOUT,
    ITEM_DETAIL_TIMEOUT,
} from "../lib/constants.js";
import { createWatchUrl } from "../lib/media.js";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function getTikTokPhoto(tiktokUrl) {
    const itemId = tiktokUrl.match(/\/(?:video|photo)\/(\d+)/)?.[1];

    if (!itemId) throw new Error("TikTok item ID tidak ditemukan.");

    let browser;

    try {
        browser = await createBrowser();

        const page = await browser.newPage();

        await page.setUserAgent(BROWSER_USER_AGENT);
        await page.setExtraHTTPHeaders({
            "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
        });

        await page.goto("https://www.tiktok.com/", {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT
        });

        await wait(3000);

        const responses = [];

        page.on("response", response => {
            try {
                const url = new URL(response.url());

                if (url.pathname !== "/api/item/detail/") return;
                if (url.searchParams.get("itemId") !== itemId) return;

                responses.push(response);
            } catch { }
        });

        await page.goto(tiktokUrl, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT
        });

        const deadline = Date.now() + ITEM_DETAIL_TIMEOUT;
        let data = null;

        while (Date.now() < deadline && !data) {
            while (responses.length) {
                const response = responses.shift();

                try {
                    const raw = await response.text();

                    if (!raw.trim()) continue;

                    const json = JSON.parse(raw);

                    if (json?.itemInfo?.itemStruct) {
                        data = json;
                        break;
                    }
                } catch { }
            }

            if (!data) await wait(250);
        }

        if (!data) {
            throw new Error("TikTok item/detail tidak memberikan data.");
        }

        const item = data.itemInfo.itemStruct;
        const sourceImages = item?.imagePost?.images;

        if (!Array.isArray(sourceImages) || !sourceImages.length) {
            throw new Error("TikTok photo carousel tidak ditemukan.");
        }

        const result = structuredClone(item);

        result.type = "photo";

        // =========================
        // ROOT CLEANUP
        // =========================

        delete result.challenges;
        delete result.textExtra;
        delete result.contents;

        delete result.authorStatsV2;
        delete result.statsV2;

        delete result.AIGCDescription;
        delete result.CategoryType;
        delete result.IsHDBitrate;
        delete result.ShowAIGC;
        delete result.creatorAIComment;
        delete result.backendSourceEventTracking;

        delete result.collected;
        delete result.digged;
        delete result.forFriend;

        delete result.duetDisplay;
        delete result.stitchDisplay;

        delete result.isAd;
        delete result.isProhibited;
        delete result.isReviewing;
        delete result.itemCommentStatus;
        delete result.item_control;

        delete result.officalItem;
        delete result.originalItem;
        delete result.privateItem;
        delete result.secret;
        delete result.shareEnabled;

        delete result.textLanguage;
        delete result.textTranslatable;
        delete result.titleLanguage;
        delete result.titleTranslatable;

        result.imagePost.images = sourceImages.map((image, index) => ({
            index,
            imageWidth: image?.imageWidth ?? null,
            imageHeight: image?.imageHeight ?? null,
            url: image?.imageURL?.urlList?.[0] || null
        }));

        if (result.imagePost.cover) {
            result.imagePost.cover = {
                imageWidth: result.imagePost.cover?.imageWidth ?? null,
                imageHeight: result.imagePost.cover?.imageHeight ?? null,
                url: result.imagePost.cover?.imageURL?.urlList?.[0] || null
            };
        }

        if (result.imagePost.shareCover) {
            result.imagePost.shareCover = {
                imageWidth: result.imagePost.shareCover?.imageWidth ?? null,
                imageHeight: result.imagePost.shareCover?.imageHeight ?? null,
                url: result.imagePost.shareCover?.imageURL?.urlList?.[0] || null
            };
        }

        if (result.music?.playUrl) {
            result.music.stream_url = createWatchUrl(result.music.playUrl);
            delete result.music.playUrl;
        }

        delete result.video;

        return result;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch { }
        }
    }
}