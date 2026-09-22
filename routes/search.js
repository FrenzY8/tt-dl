import { Router } from "express";
import { createBrowser } from "../lib/browser.js";
import { encode } from "../lib/crypto.js";
import {
    BROWSER_USER_AGENT,
    NAVIGATION_TIMEOUT,
    ITEM_DETAIL_TIMEOUT
} from "../lib/constants.js";
import { success, fail } from "../lib/response.js";

const router = Router();

const SEARCH_API = "/api/search/general/full/";
const ITEM_DETAIL_API = "/api/item/detail/";
const SEARCH_TIMEOUT = 30000;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getStreamUrl(page, item) {
    const videoId = item?.id;
    const uniqueId = item?.author?.uniqueId;

    if (!videoId || !uniqueId) return null;

    const tiktokUrl =
        `https://www.tiktok.com/@${uniqueId}/video/${videoId}`;

    const responses = [];

    const responseHandler = response => {
        try {
            const url = new URL(response.url());

            if (url.pathname !== ITEM_DETAIL_API) return;
            if (url.searchParams.get("itemId") !== videoId) return;

            responses.push(response);
        } catch {}
    };

    page.on("response", responseHandler);

    try {
        await page.goto(tiktokUrl, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT
        });

        const deadline = Date.now() + ITEM_DETAIL_TIMEOUT;
        let videoItem = null;

        while (Date.now() < deadline && !videoItem) {
            while (responses.length) {
                const response = responses.shift();

                try {
                    const raw = await response.text();

                    if (!raw.trim()) continue;

                    const json = JSON.parse(raw);

                    if (json?.itemInfo?.itemStruct) {
                        videoItem = json.itemInfo.itemStruct;
                        break;
                    }
                } catch {}
            }

            if (!videoItem) await wait(100);
        }

        if (!videoItem) {
            console.error(
                `[SEARCH STREAM] item/detail timeout: ${videoId}`
            );

            return null;
        }

        const urlStream =
            videoItem.video?.PlayAddrStruct?.UrlList?.[2] ||
            videoItem.video?.PlayAddrStruct?.UrlList?.[1] ||
            videoItem.video?.PlayAddrStruct?.UrlList?.[0] ||
            "";

        if (!urlStream) {
            console.error(
                `[SEARCH STREAM] stream not found: ${videoId}`
            );

            return null;
        }

        return `/api/watch?url=${encodeURIComponent(
            encode(urlStream)
        )}`;
    } catch (err) {
        console.error(
            `[SEARCH STREAM ERROR] ${videoId}:`,
            err instanceof Error ? err.message : err
        );

        return null;
    } finally {
        page.off("response", responseHandler);
    }
}

function cleanupVideoItem(item) {
    if (!item) return;

    if (item.video) {
        delete item.video.bitrateInfo;
        delete item.video.PlayAddrStruct;
        delete item.video.claInfo;
        delete item.video.shareCover;
        delete item.video.zoomCover;
        delete item.video.playAddr;
        delete item.video.downloadAddr;
        delete item.video.originCover;
        delete item.video.reflowCover;
        delete item.video.encodeUserTag;
        delete item.video.subtitleInfos;
        delete item.video.volumeInfo;
        delete item.video.VQScore;
    }

    delete item.scheduleTime;
    delete item.challenges;
    delete item.textExtra;
    delete item.contents;

    delete item.statsV2;
    delete item.authorStatsV2;

    delete item.warnInfo;
    delete item.penaltyContext;
    delete item.effectStickers;
    delete item.stickersOnItem;
    delete item.comments;

    delete item.diversificationLabels;
    delete item.diversificationId;
    delete item.suggestedWords;
    delete item.videoSuggestWordsList;
    delete item.channelTags;

    delete item.originalItem;
    delete item.officalItem;
    delete item.privateItem;
    delete item.secret;
    delete item.forFriend;
    delete item.digged;
    delete item.collected;

    delete item.itemCommentStatus;
    delete item.isProhibited;
    delete item.takeDown;
    delete item.isAd;
    delete item.isReviewing;

    delete item.duetEnabled;
    delete item.stitchEnabled;
    delete item.duetDisplay;
    delete item.stitchDisplay;
    delete item.shareEnabled;
    delete item.indexEnabled;

    delete item.item_control;

    delete item.IsAigc;
    delete item.AIGCDescription;
    delete item.ShowAIGC;
    delete item.creatorAIComment;

    delete item.backendSourceEventTracking;
    delete item.CategoryType;
    delete item.textLanguage;
    delete item.textTranslatable;
}

function addStreamUrls(data) {
    if (!Array.isArray(data)) return data;

    for (const entry of data) {
        if (entry?.type !== 1 || !entry?.item) continue;

        const item = entry.item;

        const bitrateInfo = Array.isArray(item.video?.bitrateInfo)
            ? item.video.bitrateInfo
            : [];

        let urlStream = "";

        for (const bitrate of bitrateInfo) {
            const urls = bitrate?.PlayAddr?.UrlList;

            if (!Array.isArray(urls)) continue;

            urlStream =
                urls[2] ||
                urls[1] ||
                urls[0] ||
                "";

            if (urlStream) break;
        }

        item.stream_url = urlStream
            ? `/api/watch?url=${encodeURIComponent(encode(urlStream))}`
            : null;

        cleanupVideoItem(item);
    }

    return data;
}

router.get("/search", async (req, res) => {
    let browser;

    try {
        const q =
            String(req.query.q || "").trim();

        const cursor = Math.max(
            0,
            Number.parseInt(
                String(req.query.cursor || "0"),
                10
            ) || 0
        );

        if (!q) {
            return res
                .status(400)
                .json(
                    fail(
                        "Missing query parameter: q"
                    )
                );
        }

        browser = await createBrowser();

        const page = await browser.newPage();

        await page.setUserAgent(
            BROWSER_USER_AGENT
        );

        await page.setExtraHTTPHeaders({
            "accept-language":
                "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
        });

        await page.goto(
            "https://www.tiktok.com/",
            {
                waitUntil: "domcontentloaded",
                timeout: NAVIGATION_TIMEOUT
            }
        );

        await wait(1500);

        const responses = new Map();

        const searchResponseHandler =
            async response => {
                try {
                    const url =
                        new URL(response.url());

                    if (
                        url.pathname !==
                        SEARCH_API
                    ) {
                        return;
                    }

                    const keyword =
                        url.searchParams.get(
                            "keyword"
                        ) || "";

                    const responseCursor =
                        Number(
                            url.searchParams.get(
                                "cursor"
                            ) || 0
                        );

                    if (
                        keyword.toLowerCase() !==
                        q.toLowerCase()
                    ) {
                        return;
                    }

                    if (!response.ok()) return;

                    const raw =
                        await response.text();

                    if (!raw.trim()) return;

                    const json =
                        JSON.parse(raw);

                    responses.set(
                        responseCursor,
                        json
                    );

                    console.log(
                        `[SEARCH RESPONSE] keyword=${keyword} cursor=${responseCursor}`
                    );
                } catch (err) {
                    console.error(
                        "[SEARCH RESPONSE ERROR]",
                        err instanceof Error
                            ? err.message
                            : err
                    );
                }
            };

        page.on(
            "response",
            searchResponseHandler
        );

        const searchUrl =
            `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

        await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT
        });

        const deadline =
            Date.now() + SEARCH_TIMEOUT;

        let lastScroll = 0;

        while (
            Date.now() < deadline &&
            !responses.has(cursor)
        ) {
            if (
                cursor > 0 &&
                Date.now() - lastScroll > 800
            ) {
                await page.evaluate(() => {
                    window.scrollTo(
                        0,
                        document.body.scrollHeight
                    );
                });

                lastScroll = Date.now();
            }

            await wait(100);
        }

        page.off(
            "response",
            searchResponseHandler
        );

        const json =
            responses.get(cursor);

        if (!json) {
            const captured =
                [...responses.keys()];

            return res.status(504).json(
                fail(
                    captured.length
                        ? `Cursor ${cursor} not captured. Captured cursors: ${captured.join(", ")}`
                        : "TikTok search API request was not detected."
                )
            );
        }

        if (json?.status_code !== 0) {
            return res
                .status(502)
                .json(
                    fail(
                        `TikTok search failed with status ${json?.status_code}.`
                    )
                );
        }

        await addStreamUrls(
            page,
            json.data
        );

        return res.json(
            success(json)
        );
    } catch (err) {
        console.error(
            "[SEARCH ERROR]",
            err
        );

        return res
            .status(500)
            .json(
                fail(
                    err instanceof Error
                        ? err.message
                        : "Internal Server Error"
                )
            );
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }
    }
});

export default router;