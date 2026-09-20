import { Router } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { encode } from "../lib/crypto.js";
import { USER_AGENT } from "../lib/constants.js";
import { success, fail } from "../lib/response.js";
import { getTikTokPhoto } from "../services/tiktokPhoto.js";

const router = Router();

router.get("/download", async (req, res) => {
    try {
        const url = req.query.url;

        if (!url) {
            return res.status(400).json(fail("Missing query parameter: url"));
        }

        const isPhoto = /\/photo\/\d+/.test(url);
        const isVideo = /\/video\/\d+/.test(url);

        if (isPhoto) {
            console.log("[DOWNLOAD] PHOTO -> Puppeteer");

            const item = await getTikTokPhoto(url);

            return res.json(
                success({
                    ...item,
                    type: "photo",
                })
            );
        }

        if (!isVideo) {
            return res.status(400).json(fail("Unsupported TikTok URL."));
        }

        console.log("[DOWNLOAD] VIDEO -> Oldschool");

        const response = await axios.get(url, {
            headers: {
                "User-Agent": USER_AGENT,
                Referer: "https://www.tiktok.com/",
            },
        });

        const $ = cheerio.load(response.data);
        const universalData = $("#__UNIVERSAL_DATA_FOR_REHYDRATION__").html();

        console.log(`[OLDSCHOOL] Status: ${response.status}`);
        console.log(`[OLDSCHOOL] HTML length: ${response.data.length}`);
        console.log(`[OLDSCHOOL] Universal: ${universalData ? "FOUND" : "NOT FOUND"}`);

        if (!universalData) {
            return res.status(404).json(fail("TikTok data not found."));
        }

        const json = JSON.parse(universalData);

        const item =
            json?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo
                ?.itemStruct;

        if (!item) {
            return res.status(404).json(fail("Video information not found."));
        }

        const urlStream =
            item.video?.PlayAddrStruct?.UrlList?.[2] ||
            item.video?.PlayAddrStruct?.UrlList?.[1] ||
            item.video?.PlayAddrStruct?.UrlList?.[0] ||
            "";

        if (!urlStream) {
            return res.status(404).json(fail("Video stream URL not found."));
        }

        const tokenLink = encodeURIComponent(encode(urlStream));

        delete item.video.bitrateInfo;
        delete item.video.zoomCover;
        delete item.video.challenges;
        delete item.video.playAddr;
        delete item.video.downloadAddr;
        delete item.video.originCover;
        delete item.video.cover;

        return res.json(
            success({
                ...item,
                type: "video",
                stream_url: `/api/watch?url=${tokenLink}`,
            })
        );
    } catch (err) {
        console.error("[DOWNLOAD ERROR]", err);

        return res.status(500).json(
            fail(err.message || "Internal Server Error")
        );
    }
});

export default router;