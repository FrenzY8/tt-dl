import axios from "axios";
import * as cheerio from "cheerio";
import { USER_AGENT } from "../lib/constants.js";
import { cleanVideoItem } from "../lib/media.js";

export async function getTikTokVideo(url) {
    const response = await axios.get(url, {
        timeout: 30_000,
        maxRedirects: 5,
        headers: {
            "User-Agent": USER_AGENT,
            Referer: "https://www.tiktok.com/"
        }
    });

    const $ = cheerio.load(response.data);
    const universalData = $("#__UNIVERSAL_DATA_FOR_REHYDRATION__").html();

    if (!universalData) throw new Error("TikTok universal data not found.");

    const json = JSON.parse(universalData);
    const item = json?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;

    if (!item) throw new Error("TikTok video information not found.");
    if (Array.isArray(item?.imagePost?.images) && item.imagePost.images.length) throw new Error("PHOTO_POST");

    return cleanVideoItem(item);
}