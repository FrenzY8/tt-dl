import { Router } from "express";
import { createBrowser } from "../lib/browser.js";
import { USER_AGENT } from "../lib/constants.js";
import { success, fail } from "../lib/response.js";

const router = Router();

const SEARCH_API = "/api/search/general/full/";
const SEARCH_TIMEOUT = 30000;

function cleanVideo(item) {
    if (!item) return null;

    return {
        type: "video",
        id: item.id || "",
        desc: item.desc || "",
        createTime: item.createTime || null,

        author: {
            id: item.author?.id || "",
            uniqueId: item.author?.uniqueId || "",
            nickname: item.author?.nickname || "",
            avatar: item.author?.avatarThumb || "",
            verified: item.author?.verified || false
        },

        video: {
            width: item.video?.width || 0,
            height: item.video?.height || 0,
            duration: item.video?.duration || 0,
            ratio: item.video?.ratio || "",
            cover: item.video?.cover || "",
            dynamicCover: item.video?.dynamicCover || "",
            playAddr: item.video?.playAddr || ""
        },

        stats: {
            diggCount: item.stats?.diggCount || 0,
            shareCount: item.stats?.shareCount || 0,
            commentCount: item.stats?.commentCount || 0,
            playCount: item.stats?.playCount || 0,
            collectCount: item.stats?.collectCount || 0
        }
    };
}

function cleanUser(user) {
    const info = user?.user_info;

    if (!info) return null;

    return {
        type: "user",
        id: info.uid || "",
        uniqueId: info.unique_id || "",
        nickname: info.nickname || "",
        signature: info.signature || "",
        avatar: info.avatar_thumb?.url_list?.[0] || "",
        verified: !!info.custom_verify,
        followerCount: info.follower_count || 0,
        totalFavorited: info.total_favorited || 0,
        secUid: info.sec_uid || ""
    };
}

function cleanSearchResults(data) {
    const results = [];

    for (const entry of data || []) {
        // VIDEO
        if (entry?.type === 1 && entry.item) {
            const video = cleanVideo(entry.item);

            if (video) results.push(video);

            continue;
        }

        // USER
        if (entry?.type === 4 && Array.isArray(entry.user_list)) {
            for (const user of entry.user_list) {
                const cleaned = cleanUser(user);

                if (cleaned) results.push(cleaned);
            }
        }
    }

    return results;
}

router.get("/search", async (req, res) => {
    let browser;

    try {
        const q = String(req.query.q || "").trim();
        const cursor = Math.max(0, Number.parseInt(req.query.cursor, 10) || 0);

        if (!q) {
            return res.status(400).json(
                fail("Missing query parameter: q")
            );
        }

        browser = await createBrowser();

        const page = await browser.newPage();

        await page.setUserAgent(USER_AGENT);

        await page.setExtraHTTPHeaders({
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
        });

        const searchResponsePromise = page.waitForResponse(
            response => {
                if (!response.url().includes(SEARCH_API)) return false;

                try {
                    const url = new URL(response.url());

                    const keyword = url.searchParams.get("keyword");
                    const responseCursor = Number(
                        url.searchParams.get("cursor") || 0
                    );

                    return (
                        keyword?.toLowerCase() === q.toLowerCase() &&
                        responseCursor === cursor
                    );
                } catch {
                    return false;
                }
            },
            {
                timeout: SEARCH_TIMEOUT
            }
        );

        const searchUrl =
            `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

        try {
            await page.goto(searchUrl, {
                waitUntil: "domcontentloaded",
                timeout: SEARCH_TIMEOUT
            });
        } catch (err) {
            console.warn(
                "[SEARCH NAVIGATION WARNING]",
                err instanceof Error ? err.message : err
            );
        }

        if (cursor > 0) {
            const targetPage = Math.ceil(cursor / 12);
            const maxScrolls = targetPage + 2;

            for (let i = 0; i < maxScrolls; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });

                await new Promise(resolve => setTimeout(resolve, 1200));
            }
        }

        const response = await searchResponsePromise;

        if (!response) {
            return res.status(404).json(
                fail("TikTok search response not found.")
            );
        }

        console.log(
            `[SEARCH] API ${response.status()} ${response.url()}`
        );

        if (!response.ok()) {
            return res.status(response.status()).json(
                fail(`TikTok search returned HTTP ${response.status()}.`)
            );
        }

        const json = await response.json();

        if (json?.status_code !== 0) {
            return res.status(502).json(
                fail(`TikTok search failed with status ${json?.status_code}.`)
            );
        }

        const results = cleanSearchResults(json.data);

        return res.json(
            success({
                query: q,
                cursor,
                next_cursor: json.cursor ?? null,
                has_more: json.has_more === 1,
                count: results.length,
                results
            })
        );
    } catch (err) {
        console.error("[SEARCH ERROR]", err);

        return res.status(500).json(
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
            } catch (err) {
                console.error(
                    "[SEARCH BROWSER CLOSE ERROR]",
                    err instanceof Error ? err.message : err
                );
            }
        }
    }
});

export default router;