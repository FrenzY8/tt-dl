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

        const response = await axios.get(url, {
            headers: {
                "User-Agent": USER_AGENT,
                Referer: "https://www.tiktok.com/",
            },
        });

        const $ = cheerio.load(response.data);
        const universalData = $("#__UNIVERSAL_DATA_FOR_REHYDRATION__").html();

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

        // =========================
        // VIDEO CLEANUP
        // =========================

        delete item.video.bitrateInfo;
        delete item.video.PlayAddrStruct;
        delete item.video.claInfo;
        delete item.video.shareCover;
        delete item.video.zoomCover;
        delete item.video.playAddr;
        delete item.video.downloadAddr;
        delete item.video.originCover;
        delete item.video.cover;

        delete item.video.reflowCover;
        delete item.video.encodeUserTag;
        delete item.video.subtitleInfos;
        delete item.video.volumeInfo;
        delete item.video.VQScore;

        // =========================
        // ROOT CLEANUP
        // =========================

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