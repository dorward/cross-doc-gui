const { app, BrowserWindow, ipcMain } = require("electron");

const { dirname } = require("path");
const { fileURLToPath } = require("url");

const {
	sort:sortPromise,
	get_files,
	read_files,
	parse_data,
	clean_html,
	add_front_matter,
	warn_missing_reciprocal_links,
	read
} = require("cross-doc");

// import {get_files} from "./lib/get_files.js";
// import {read_files} from "./lib/read_files.js";
// import {parse_data} from "./lib/parse_data.js";
// import {clean_html} from "./lib/clean_html.js";
// import {add_front_matter} from "./lib/add_front_matter.js";
// import {warn_missing_reciprocal_links} from "./lib/warn_missing_reciprocal_links.js";
// import {sortPromise} from "./lib/sort.js";
// import {read} from "./lib/read.js";

function createWindow() {
	// Create the browser window.
	const win = new BrowserWindow({
		width: 1800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
		},
	});

	// and load the index.html of the app.
	win.loadFile("../assets/index.html");

	// Open the DevTools.
	win.webContents.openDevTools();
}

ipcMain.on("request-refresh", async (event, options) => {
	console.log("Refresh request");
	console.log({options});
	const entries = await get_data(options);
	const categories = await get_categories(options);
	event.reply("refresh", { entries, categories });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

async function get_data(options) {
	const { sort } = await sortPromise(options);
	const files = await get_files(options);
	console.log("Files");
	const data = await read_files(files);
	console.log("Data");
	const parsed_data = parse_data(data);
	console.log("Parsed data");
	const cleaned_data = clean_html(parsed_data);
	console.log("Cleaned data");
	const enhanced_data = add_front_matter(cleaned_data);
	console.log("Enhanced data");
	warn_missing_reciprocal_links(enhanced_data);
	console.log("Warnings");
	const sorted_data = sort(enhanced_data);
	return sorted_data;
}

async function get_categories(options) {
	const default_types = JSON.parse(
		await read(`${options.project}/data/categories.json`)
	);
	return default_types;
}
