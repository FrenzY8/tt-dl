import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import fs from "fs";
import { CHROMIUM_PACK } from "./constants.js";

const IS_VERCEL = !!process.env.VERCEL;

async function getExecutablePath() {
    if (IS_VERCEL) return chromium.executablePath(CHROMIUM_PACK);

    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

    const candidates = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
        process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe` : null
    ].filter(Boolean);

    for (const path of candidates) {
        if (fs.existsSync(path)) return path;
    }

    throw new Error("Chrome / Edge tidak ditemukan.");
}

export async function createBrowser() {
    const executablePath = await getExecutablePath();

    return puppeteer.launch({
        executablePath,
        args: IS_VERCEL ? chromium.args : ["--disable-dev-shm-usage"],
        headless: IS_VERCEL ? true : false,
        defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }
    });
}