import { encode } from "./crypto.js";

export function createWatchUrl(url) {
    if (!url || typeof url !== "string") return null;
    return `/api/watch?url=${encodeURIComponent(encode(url))}`;
}

export function getVideoUrl(item) {
    const playAddr = item?.video?.PlayAddrStruct?.UrlList || item?.video?.PlayAddrStruct?.urlList;

    if (Array.isArray(playAddr) && playAddr.length) {
        return playAddr[2] || playAddr[1] || playAddr[0];
    }

    if (Array.isArray(item?.video?.bitrateInfo)) {
        for (const bitrate of item.video.bitrateInfo) {
            const urls = bitrate?.PlayAddr?.UrlList || bitrate?.PlayAddr?.urlList;
            if (Array.isArray(urls) && urls.length) return urls[0];
        }
    }

    if (typeof item?.video?.playAddr === "string") return item.video.playAddr;
    if (typeof item?.video?.downloadAddr === "string") return item.video.downloadAddr;

    return null;
}

export function cleanVideoItem(item) {
    const result = structuredClone(item);
    const streamUrl = getVideoUrl(result);

    if (result.video) {
        delete result.video.bitrateInfo;
        delete result.video.zoomCover;
        delete result.video.challenges;
        delete result.video.playAddr;
        delete result.video.downloadAddr;
        delete result.video.originCover;
        delete result.video.cover;
        delete result.video.PlayAddrStruct;
    }

    result.type = "video";
    result.stream_url = createWatchUrl(streamUrl);

    return result;
}