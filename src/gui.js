const { app, BrowserWindow, ipcMain } = require("electron");
const PDFWindow = require("electron-pdf-window");

const {
	sort: sortPromise,
	get_files,
	read_files,
	parse_data,
	clean_html,
	add_front_matter,
	warn_missing_reciprocal_links,
	read,
	generate_html,
	replace_placeholders,
	add_title_attributes,
	add_table_of_contents,
	output,
} = require("cross-doc");

ipcMain.on("request-refresh", async (event, options) => {
	console.log("Refresh request");
	console.log({ options });
	const entries = await get_data(options);
	const categories = await get_categories(options);
	event.reply("refresh", { entries, categories });
});

ipcMain.on("request-pdf", async (event, options) => {
	console.log("Refresh pdf");
	await createPDF(options);
	const win = new PDFWindow({
		width: 800,
		height: 600,
	});
	win.loadFile(options.pdf_file_name);
});

const createWindow = () => {
	// Create the browser window.
	const win = new BrowserWindow({
		width: 1800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true,
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

async function createPDF(options) {
	console.log({ options });
	const { sort } = await sortPromise(options);
	process.stderr.write("Getting files....\n");
	const files = await get_files(options);
	process.stderr.write("Reading files....\n");
	const data = await read_files(files);
	process.stderr.write("Parsing data....\n");
	const parsed_data = parse_data(data);
	process.stderr.write("Cleaning HTML....\n");
	const cleaned_data = clean_html(parsed_data);
	process.stderr.write("Adding front matter....\n");
	const enhanced_data = add_front_matter(cleaned_data);
	process.stderr.write("Checking links....\n");
	warn_missing_reciprocal_links(enhanced_data);
	process.stderr.write("Sorting data....\n");
	const sorted_data = sort(enhanced_data);
	process.stderr.write("Generating HTML....\n");
	const $ = await generate_html(sorted_data, options);
	process.stderr.write("Replacing placeholders....\n");
	replace_placeholders($);
	process.stderr.write("Adding title attributes....\n");
	add_title_attributes($);
	process.stderr.write("Building table of contents....\n");
	add_table_of_contents($);
	process.stderr.write("Generating output....\n");
	// const graph = generate_graph($, sorted_data, options);
	output($, options);
	return options.pdf_file_name;
}

async function get_categories(options) {
	const default_types = JSON.parse(
		await read(`${options.project}/data/categories.json`)
	);
	return default_types;
}
