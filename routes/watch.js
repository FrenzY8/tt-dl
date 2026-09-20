import { Router } from "express";
import axios from "axios";
import { decode } from "../lib/crypto.js";
import { USER_AGENT } from "../lib/constants.js";
import { fail } from "../lib/response.js";

const router = Router();

router.get("/watch", async (req, res) => {
    try {
        const tokenParam = req.query.url;

        if (!tokenParam) return res.status(400).json(fail("Missing query parameter: url"));

        const token = decodeURIComponent(String(tokenParam));
        const url = decode(token);

        const headers = {
            "User-Agent": USER_AGENT,
            Referer: "https://www.tiktok.com/"
        };

        if (req.headers.range) headers.Range = req.headers.range;

        const response = await axios({
            method: "GET",
            url,
            responseType: "stream",
            headers,
            validateStatus: () => true
        });

        if (response.status >= 400) {
            response.data.destroy();
            return res.status(response.status).json(fail("Unable to fetch media."));
        }

        const allowedHeaders = [
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges",
            "cache-control",
            "etag",
            "last-modified"
        ];

        for (const header of allowedHeaders) {
            const value = response.headers[header];
            if (value !== undefined) res.setHeader(header, value);
        }

        res.status(response.status);

        response.data.on("error", error => {
            console.error("[WATCH STREAM ERROR]", error.message);
            if (!res.destroyed) res.destroy(error);
        });

        response.data.pipe(res);
    } catch (err) {
        console.error("[WATCH ERROR]", err);

        if (res.headersSent) return res.destroy();

        return res.status(500).json(
            fail(err instanceof Error ? err.message : "Internal Server Error")
        );
    }
});

export default router;