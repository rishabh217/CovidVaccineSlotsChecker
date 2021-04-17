const fs = require('fs');
const path = require("path");

const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer'); // For sending mails

let { email, password } = require('../secrets'); // Importing the credentials for gmail login in nodemailer

let searchArr = [];
let page, headlessPage;

// Details entered by user through console
const pincode = process.argv[2];
const myAddress = process.argv[3];
const emailId = process.argv[4];

async function run() {
    // A non headless browser for the purpose of extracting the vaccination center details, map route screenshot and map route dummy html 
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null
    });
    // A headless browser for the purpose of printing the center route as pdf as it cant be done in non headless browser
    const headlessBrowser = await puppeteer.launch({
        defaultViewport: null
    });

    headlessPage = await headlessBrowser.newPage();

    try {

        // Start of fetching the center details
        page = await browser.newPage();
        await performFetchingTask();
        // End of fetching the center details

        // Start of performing all the tasks related to map and details of all centers
        page = await browser.newPage();
        await performMapTasks();
        // End of performing all the tasks related to map and details of all centers

        // Start of sending email task
        let emailMsg = await sendEmail();
        console.log("Email status", emailMsg);
        // End of sending email task

    } catch (err) {
        console.log(err);
    }

    // Closing both browser when work is complete
    browser.close();
    headlessBrowser.close();

}

async function performFetchingTask() {
    // Will take the page to the official Cowin website which consist all the details of vaccination centers.
    await page.goto("https://www.cowin.gov.in/home", { "waitUntil": "networkidle0" });

    await page.waitForSelector('.mainContainer');
    await waitAndClick('#mmiMap1_search1');
    await page.type('#mmiMap1_search1', pincode, { delay: 500 }); // Inputting the pincode provided by the user

    // Sometimes the dropdown menu does not appear instantly hence moving the cursor so as to stimulate some typing
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');

    // Waiting for 4 seconds manually so that the dropdown menu loads properly
    await page.waitForTimeout(4000);
    await waitAndClick('#mmiMap1_search1_li0');

    await page.waitForSelector('#MMI_near', { visible: true });

    // This will help in getting all the nearby centers in an array form
    searchArr = await page.evaluate(getNearbyCenters);

    console.log(searchArr.length, "Centers Fetched");

    return page.close();
}

// Function used by page.evaluate which will deal with the DOM elements
function getNearbyCenters() {
    let searchArr = [];
    // Getting the unordered list using its selector
    let allCenters = document.querySelector('#MMI_near').querySelectorAll("li");
    for (let i = 0; i < allCenters.length; i++) {
        let centerName = allCenters[i].querySelector("div>h3").innerText;
        console.log(centerName);
        let centerAddress = allCenters[i].querySelector("div>p").innerText;
        searchArr.push({
            name: centerName,
            address: centerAddress
        });
    }
    return searchArr;
}

async function performMapTasks() {
    // Assessing all the center details one by one so as to get map route of each one
    for (let idx in searchArr) {
        dirCreator(path.join('../files', searchArr[idx].name));
        await doMapScrapping(searchArr[idx]);
    }
    // Completion of map tasks
    return page.close();
}

async function doMapScrapping(search) {
    // Opening google maps to get directions to the vaccination center
    await page.goto("https://www.google.co.in/maps");
    await page.waitForTimeout(2000);

    await enterDetailsInMap(search);

    // Waiting till all frames are loaded
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // Clicking on the best route according to google
    await waitAndClick('#section-directions-trip-0');

    // Details of a particular center scrapped successfully
    return getDetailsFromRoute(search);
}

// Function which will type the address of center as well as user address in google maps
async function enterDetailsInMap(search) {
    await waitAndClick('input[aria-label="Search Google Maps"]');
    await page.type('input[aria-label="Search Google Maps"]', search.name + " " + search.address, { delay: 30 });
    await waitAndClick('#searchbox-searchbutton');

    await page.waitForSelector('#pane .widget-pane-content-holder', { visible: true });

    // In some cases, direction icon is not directly visible but paces list appears, it will check if that list is there or not
    let presence = await page.evaluate(() => {
        let el = document.querySelector('#pane .section-place-result-container-summary');
        if (el == null)
            return false;
        else
            return true;
    });

    // If the places list is there, it will click on the top result
    if (presence) {
        await waitAndClick('#pane .section-place-result-container-summary');
    }

    await waitAndClick('img[alt="Directions"]');
    await waitAndClick('#directions-searchbox-0 input[class="tactile-searchbox-input"]');
    await page.type('#directions-searchbox-0 input[class="tactile-searchbox-input"]', myAddress, { delay: 50 });
    return page.keyboard.press('Enter');
}

// This will perform the scrapping on google maps to get route map screenshot, route map embedded html and route directions pdf
async function getDetailsFromRoute(search) {
    await page.waitForSelector('canvas[class="widget-scene-canvas"]', { visible: true });

    await getShareLinkAndMapHTML(search);

    return getMapDetailsAndScreenshot(search);
}

// This will handle the map embedded html as well as fetching route link part
async function getShareLinkAndMapHTML(search) {
    await waitAndClick('button[jsaction="pane.action.share"]');

    // Waiting till overlay is properly loaded and visible
    await page.waitForSelector('.modal-dialog-content', { visible: true });

    await page.waitForSelector('input[jsaction="pane.copyLink.clickInput"]', { visible: true });

    // This will return the link having route to the vaccination center
    let link = await page.evaluate(getEmbeddedHTML, 'input[jsaction="pane.copyLink.clickInput"]');

    // This will save the center route link along with the center details in a JSON file
    alterJSON(search, link);

    await waitAndClick('button[aria-label="Embed a map"]');

    await page.waitForSelector('input[jsaction="pane.embedMap.clickInput"]', { visible: true });

    let dirPath = path.join('../files', search.name, search.name + ".html");

    // This will return the html of the map embedded
    let html = await page.evaluate(getEmbeddedHTML, 'input[jsaction="pane.embedMap.clickInput"]');

    fileCreator(dirPath, html);

    return waitAndClick('button[jsaction="modal.close"]');
}

// Function which page.evaluate will use to get text from DOM
function getEmbeddedHTML(selector) {
    let inputHTML = document.querySelector(selector).getAttribute("value");
    return inputHTML;
}

// This function will handle the task of creating the pdf of route directions and the task of creating screenshot of route map
async function getMapDetailsAndScreenshot(search) {
    await waitAndClick('button[jsaction="pane.action.printOpen"]')
    await waitAndClick('button[jsaction="pane.action.printWithMaps"]');

    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // Storing the url of the map directions so that it can be used directly by headless browser instance to directly open that part and print them
    let printUrl = page.url();

    // Setting up the position of the part of which screenshot is to be taken, which is map here
    const pos = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
    }, 'canvas[class="widget-scene-canvas"]');

    let dirPath = path.join('../files', search.name, search.name + ".png");
    fileCreator(dirPath, "");
    await page.screenshot({ path: dirPath, clip: pos });

    await waitAndClick('button[jsaction="print.exit"]');

    // Opening the directions link saved earlier in the headless browser
    await headlessPage.goto(printUrl);
    await headlessPage.waitForNavigation({ waitUntil: 'networkidle0' });

    dirPath = path.join('../files', search.name, search.name + ".pdf");
    fileCreator(dirPath, "");

    // Creating the pdf of the map directions page
    return headlessPage.pdf({
        printBackground: true,
        path: dirPath,
        format: "A4",
        margin: {
            top: "20px",
            bottom: "40px",
            left: "20px",
            right: "20px"
        }
    });

}

// This function is used to click some selector when it becomes visibile
async function waitAndClick(selector) {
    await page.waitForSelector(selector, { visible: true });
    return page.click(selector);
}

// This function creates the directory synchronously according to the path provided
function dirCreator(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath);
        console.log(filePath + " -> Created");
    }
}

// This function creates the file synchronously according to the path provided
function fileCreator(filePath, content) {
    fs.writeFileSync(filePath, content);
    console.log(filePath + " -> Created");
}

// This function accesses the present centers JSON file to add more centers to it
function alterJSON(centerName, centerLink) {
    let dirPath = path.join('../files', "centers.json");
    let data = fs.readFileSync(dirPath);
    let content = JSON.parse(data);
    content.push({
        center: centerName,
        route: centerLink
    });
    fs.writeFileSync(dirPath, JSON.stringify(content));
}

// This function send the email to the user returns its promise
function sendEmail() {
    const content = fs.readFileSync('../files/centers.json');
    let arr = JSON.parse(content);
    let data = "";
    let count = 1;

    for (let idx in arr) {
        let obj = arr[idx];
        data += count++ + ". " + obj.center.name + "\n" + obj.center.address + "\n" + obj.route + "\n\n";
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: email,
            pass: password
        }
    });

    const mailOptions = {
        from: email,
        to: emailId,
        subject: "Vaccination centers near to " + pincode,
        text: data
    };

    // This is user defined Promise which will contain the result of the sendMail function accordingly 
    return new Promise(function (resolve, reject) {
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                reject(error);
            } else {
                resolve(info.response);
            }
        });
    });

}

// An IIFE function
(function () {
    dirCreator(path.join("../", "files"));
    fileCreator(path.join('../files', "centers.json"), "[]");
    run();
})();


// console command example =>
// node main.js "110092" "Milan Vihar Apartments, I.P. Extension" "rishabhgpt079@gmail.com"