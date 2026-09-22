import { Router } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { createBrowser } from "../lib/browser.js";
import { encode } from "../lib/crypto.js";
import { BROWSER_USER_AGENT, USER_AGENT } from "../lib/constants.js";
import { success, fail } from "../lib/response.js";

const router = Router();
const SEARCH_API = "/api/search/general/full/";
const SEARCH_TIMEOUT = 45000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getStreamUrl(item) {
    try {
        const videoId = item?.id;
        const uniqueId = item?.author?.uniqueId;

        if (!videoId || !uniqueId) return null;

        const url = `https://www.tiktok.com/@${uniqueId}/video/${videoId}`;

        const response = await axios.get(url, {
            timeout: 30000,
            maxRedirects: 5,
            headers: {
                "User-Agent": USER_AGENT,
                Referer: "https://www.tiktok.com/"
            }
        });

        const $ = cheerio.load(response.data);
        const universalData = $("#__UNIVERSAL_DATA_FOR_REHYDRATION__").html();

        if (!universalData) return null;

        const json = JSON.parse(universalData);
        const videoItem = json?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;

        if (!videoItem) return null;

        const urlStream =
            videoItem.video?.PlayAddrStruct?.UrlList?.[2] ||
            videoItem.video?.PlayAddrStruct?.UrlList?.[1] ||
            videoItem.video?.PlayAddrStruct?.UrlList?.[0] ||
            "";

        if (!urlStream) return null;

        const tokenLink = encodeURIComponent(encode(urlStream));

        return `/api/watch?url=${tokenLink}`;
    } catch (err) {
        console.error(`[SEARCH STREAM ERROR] ${item?.id || "unknown"}:`, err instanceof Error ? err.message : err);
        return null;
    }
}

async function addStreamUrls(data) {
    if (!Array.isArray(data)) return data;

    const videos = data.filter(entry => entry?.type === 1 && entry?.item);

    await Promise.all(
        videos.map(async entry => {
            entry.item.stream_url = await getStreamUrl(entry.item);
        })
    );

    return data;
}

router.get("/search", async (req, res) => {
    let browser;

    try {
        const q = String(req.query.q || "").trim();
        const cursor = Math.max(0, Number.parseInt(String(req.query.cursor || "0"), 10) || 0);

        if (!q) return res.status(400).json(fail("Missing query parameter: q"));

        browser = await createBrowser();

        const page = await browser.newPage();

        await page.setUserAgent(BROWSER_USER_AGENT);
        await page.setExtraHTTPHeaders({
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
        });

        const responses = new Map();

        const responseHandler = async response => {
            const responseUrl = response.url();

            if (!responseUrl.includes(SEARCH_API)) return;

            try {
                const parsed = new URL(responseUrl);
                const keyword = parsed.searchParams.get("keyword") || "";
                const responseCursor = Number(parsed.searchParams.get("cursor") || 0);

                if (keyword.toLowerCase() !== q.toLowerCase()) return;
                if (!response.ok()) return;

                const json = await response.json();

                responses.set(responseCursor, json);

                console.log(`[SEARCH RESPONSE] status=${response.status()} keyword=${keyword} cursor=${responseCursor}`);
            } catch (err) {
                console.error("[SEARCH RESPONSE ERROR]", err instanceof Error ? err.message : err);
            }
        };

        page.on("response", responseHandler);

        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

        await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: SEARCH_TIMEOUT
        });

        const startedAt = Date.now();
        let lastScroll = 0;

        while (Date.now() - startedAt < SEARCH_TIMEOUT) {
            if (responses.has(cursor)) break;

            if (cursor > 0 && Date.now() - lastScroll >= 1000) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                lastScroll = Date.now();
            }

            await sleep(250);
        }

        page.off("response", responseHandler);

        const json = responses.get(cursor);

        if (!json) {
            const captured = [...responses.keys()];

            return res.status(504).json(
                fail(
                    captured.length
                        ? `Cursor ${cursor} not captured. Captured cursors: ${captured.join(", ")}`
                        : "TikTok search API request was not detected."
                )
            );
        }

        if (json?.status_code !== 0) return res.status(502).json(fail(`TikTok search failed with status ${json?.status_code}.`));

        await addStreamUrls(json.data);

        return res.json(success(json));
    } catch (err) {
        console.error("[SEARCH ERROR]", err);

        return res.status(500).json(
            fail(err instanceof Error ? err.message : "Internal Server Error")
        );
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (err) {
                console.error("[SEARCH BROWSER CLOSE ERROR]", err instanceof Error ? err.message : err);
            }
        }
    }
});

export default router;