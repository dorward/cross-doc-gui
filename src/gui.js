const { app, BrowserWindow, ipcMain } = require("electron");

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

ipcMain.on("request-refresh", async (event, options) => {
	console.log("Refresh request");
	console.log({options});
	const entries = await get_data(options);
	const categories = await get_categories(options);
	event.reply("refresh", { entries, categories });
});

const createWindow = () => {
	// Create the browser window.
	const win = new BrowserWindow({
		width: 1800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true
		},
	});

	// and load the index.html of the app.
	win.loadFile("../assets/index.html");

	// Open the DevTools.
	win.webContents.openDevTools();
};

app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
