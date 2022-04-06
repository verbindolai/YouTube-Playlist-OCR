
import 'dotenv/config'
import { Cluster } from "puppeteer-cluster";
import puppeteer from "puppeteer";
import fs from "fs";
import Jimp from "jimp";
import axios from "axios";
import durationFNS from "duration-fns";
import Tesseract from "tesseract.js";
import { MultiProgressBars } from 'multi-progress-bars';
import chalk from 'chalk';
import Duration from "duration";

const SECOND_OFFSET = 20;
const API_KEY = process.env.YT_API_KEY
const CONCURRENT_SCRAPERS = 5;
const TESSRACT_WORKERS = 4;
const LANGUAGE = "deu";
const FILE_PATH = "./questions/";
const FILE_NAME = "questions";

//Box where the Text is in the Video/Screenshots
const TEXT_PART_POSTION = {
    X: 170,
    Y: 20,
    WIDTH: 959,
    HEIGHT: 180,
}
const scheduler = Tesseract.createScheduler();
const workers = [];

const mpb = new MultiProgressBars({
    initMessage: ' $ Parsing Playlist ',
    anchor: 'bottom',
    persist: false,
    border: true,
});

const minimal_args = [
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-setuid-sandbox',
    '--disable-speech-api',
    '--disable-sync',
    '--hide-scrollbars',
    '--ignore-gpu-blacklist',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-sandbox',
    '--no-zygote',
    '--password-store=basic',
    '--use-gl=swiftshader',
    '--use-mock-keychain',
];


// Init Tesseract Workrers
(async () => {
    for (let i = 0; i < TESSRACT_WORKERS; i++) {
        const worker = Tesseract.createWorker();
        await worker.load();
        await worker.loadLanguage(LANGUAGE);
        await worker.initialize(LANGUAGE);
        scheduler.addWorker(worker);
        workers.push(worker);
    }
})();

// Helper function
function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
}

/**
 * Makes a screenshot of the video
 * @param {*} param0 URL of the video
 * @returns A Promise to a Screenshot of the Video
 */
const screenshot = async ({ data: url }) => {
    try {
        const browser = await puppeteer.launch({
            args: minimal_args,
            headless: true,
        });
        const page = await browser.newPage();
        await page.goto(url);
        await page.setViewport({ width: 1920, height: 1080 });
        const video = await page.$(".html5-video-player");
        await page.waitForSelector(".ytd-consent-bump-v2-lightbox").then((e) => {
            e.evaluate(() => {
                document
                    .querySelectorAll(
                        ".ytd-consent-bump-v2-lightbox #content .ytd-button-renderer"
                    )[3]
                    .click();
            });
        });

        //Skip ads
        await page.evaluate(() => {
            self.moHandler = {
                changesObserver: function (mutation) {
                    if (mutation.type === "attributes") {
                        if (
                            mutation.target.className == "ytp-ad-skip-button-container" ||
                            mutation.target.className ==
                            "style-scope ytd-button-renderer style-text size-default"
                        ) {
                            mutation.target.click();
                        }
                    }
                },
                subscriber: function (mutations) {
                    mutations.forEach((mutation) => {
                        self.moHandler.changesObserver(mutation);
                    });
                },
                init: function () {
                    const target = self.document.documentElement;
                    const config = {
                        attributes: true,
                    };
                    self.mObserver = new MutationObserver(self.moHandler.subscriber);
                    self.mObserver.observe(target, config);
                },
            };

            self.moHandler.init();
        });

        await page.exposeFunction("delay", delay);

        /*
         * Changes quality to the highest possible 
         */

        /*
        await page.evaluate(async () => {
            const quality = "Highest";
            let settingsButton = document.getElementsByClassName("ytp-settings-button")[0];
            settingsButton.click();
            await delay(500);

            let qualityMenu = document.getElementsByClassName("ytp-panel-menu")[0].lastChild;
            qualityMenu.click();
            await delay(500);

            let qualityOptions = [...document.getElementsByClassName("ytp-menuitem")];

            let selection;
            if (quality == 'Highest') selection = qualityOptions[0];
            else selection = qualityOptions.filter(el => el.innerText == quality)[0];

            if (!selection) {
                let qualityTexts = qualityOptions.map(el => el.innerText).join('\n');
                console.log('"' + quality + '" not found. Options are: \n\nHighest\n' + qualityTexts);
                settingsButton.click();                               // click menu button to close
                return;
            }

            if (selection.attributes['aria-checked'] === undefined) { // not checked
                selection.click();
            } else settingsButton.click();
        })

        await delay(2000);
        */

        await page.evaluate(() => {
            let dom = document.querySelector(".ytp-chrome-bottom");
            dom.style.display = "none";
        });

        await (await page.$(".html5-video-player")).click();
        await delay(800);
        await page.keyboard.press("Space");
        await delay(100);
        let image = await video.screenshot({ encoding: "base64" });
        browser.close();
        return image;
    } catch (err) {
        console.error(err);
    }
}

/**
 * Makes a screenshot every SECOND_OFFSET seconds
 * @param {*} videoId VideoId the screenshots should be made of
 * @returns An array of promises to screenshots
 */
async function getScreenshots(videoId) {

    const videoData = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails&key=${API_KEY}&forUsername=d`
    );
    const duration = videoData.data.items[0].contentDetails.duration;

    const durationInSeconds = durationFNS.toSeconds(duration);
    const startTime = 0;

    const screenshotPromises = [];

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: CONCURRENT_SCRAPERS,
    });

    cluster.task(screenshot)

    for (let screenShotTime = startTime; screenShotTime < durationInSeconds; screenShotTime += SECOND_OFFSET) {
        const url = `https://www.youtube.com/watch?v=${videoId}&t=${screenShotTime}`;
        screenshotPromises.push(cluster.execute(url))
    }
    return screenshotPromises;
}

/**
 * Processes the screenshots for ocr and does ocr on them
 * @param {*} screenshotPromises 
 * @param {*} videoId 
 * @returns A Promise to Question Objects
 */
async function processScreenshots(screenshotPromises, videoId) {
    const extractionsPromises = []
    for (let i = 0; i < screenshotPromises.length; i++) {

        const extraction = screenshotPromises[i].then(async (image) => {

            const buffer = Buffer.from(image, "base64");
            const processedImage = await Jimp.read(buffer);

            return new Promise((resolve, reject) => {
                processedImage
                    .greyscale()
                    .invert()
                    .contrast(0.45)
                    .crop(TEXT_PART_POSTION.X, TEXT_PART_POSTION.Y, TEXT_PART_POSTION.WIDTH, TEXT_PART_POSTION.HEIGHT)
                    .getBuffer(Jimp.MIME_PNG, (err, buffer) => {
                        if (err) {
                            reject(err);
                        }
                        getTextFromScreenshot(buffer).then(text => {
                            const extractionObj = { text: text, videoId: videoId, time: i * SECOND_OFFSET }
                            mpb.incrementTask('Video-' + videoId, { percentage: 1 / screenshotPromises.length });
                            console.log(chalk.green("Screenshot " + i + " of " + videoId + " processed."));
                            resolve(extractionObj)
                        }).catch(err => reject(err));
                    });
            });

        });
        extractionsPromises.push(extraction.catch(console.error));
    }

    return extractionsPromises;
}

/**
 * Gets the text from a screenshot
 * @param {*} buffer 
 * @returns Promise to the text
 */
async function getTextFromScreenshot(buffer) {
    return scheduler.addJob('recognize', buffer).then(data => {
        return data.data.text;
    });
}

/**
 * Collects the OCRData from a Video
 * @param {*} videoId 
 * @returns 
 */
async function collectOCRData(videoId) {
    mpb.addTask('Video-' + videoId, { type: 'percentage', barColorFn: chalk.blue });
    const screenshotPromises = await getScreenshots(videoId);
    const extractionPromises = await processScreenshots(screenshotPromises, videoId);
    const extractions = await Promise.all(extractionPromises);
    const filteredExtractions = extractions.filter((extractionObj, index) => {
        const text = extractionObj.text;
        const isDuplicate = extractions.findIndex((q) => q.text === text) !== index;
        const isToShort = text.length < 6;
        return !isDuplicate && !isToShort;
    });
    return filteredExtractions;
}


/**
 * Gets the ids of all videos in a playlist
 * @param {*} playlistId Youtube Playlist Id
 */
async function getVideoIdsForPlaylist(playlistId) {
    const videoIds = [];
    const maxResults = 10;
    let playlistData = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&maxResults=${maxResults}&part=snippet`);
    let responseData = playlistData.data;
    let nextPageToken = responseData.nextPageToken;

    const videoIdsFromPage = responseData.items.map((item) => item.snippet.resourceId.videoId);
    videoIds.push(...videoIdsFromPage);

    while (nextPageToken) {
        playlistData = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&maxResults=${maxResults}&part=snippet&pageToken=${nextPageToken}`);
        responseData = playlistData.data;
        nextPageToken = responseData.nextPageToken;

        const videoIdsFromPage = responseData.items.map((item) => item.snippet.resourceId.videoId);
        videoIds.push(...videoIdsFromPage);
        await delay(100);
    }
    return videoIds;
}

/**
 * Parses the playlist
 */
async function parsePlaylist() {

    const config = JSON.parse(await fs.promises.readFile("config.json", "utf8"));
    const playlistId = config.playlistId;
    const processedVideos = config.processedVideos;

    const videoIds = await getVideoIdsForPlaylist(playlistId);

    const videoIdsToProcess = videoIds.filter((videoId) => !processedVideos.includes(videoId));
    if (videoIdsToProcess.length === 0) {
        mpb.close();
        console.log(chalk.red("No new videos to process."));
        return;
    }
    mpb.addTask('Playlist', { type: 'percentage', barColorFn: chalk.green });

    console.log(videoIdsToProcess);

    for (let i = 0; i < videoIdsToProcess.length; i++) {
        const videoId = videoIdsToProcess[i];
        const startTime = new Date();
        const filteredExtractions = await collectOCRData(videoId);
        mpb.done('Video-' + videoId, { message: `Parsing of Video: ${videoId}  finished. Took ${new Duration(startTime).toString(1)}` });

        mpb.updateTask('Playlist', { percentage: i / videoIdsToProcess.length });
        fs.promises.appendFile(
            `${FILE_PATH}${FILE_NAME}-${videoId}.json`,
            JSON.stringify(filteredExtractions),
            "utf8"
        );
        console.log(filteredExtractions)
        processedVideos.push(videoId);
        fs.promises.writeFile("config.json", JSON.stringify({ processedVideos, playlistId }), "utf8");
    }
    mpb.done("Playlist", { message: "Parsed complete playlist." })
    mpb.close();
}

parsePlaylist().then(() => {
    process.exit()
}).catch(err => console.error(err));