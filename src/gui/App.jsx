import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Toolbar } from "primereact/toolbar";
import { Button } from "primereact/button";
import { Tree } from "primereact/tree";
const { dialog } = require("electron").remote;

const { ipcRenderer } = require("electron");

const options = {
  baseName: "out/heb-sed",
  project: "../legends-walk",
  html_file_name: "../legends-walk/out/test.html",
  embedded_html_file_name: "../legends-walk/out/test-complete.html",
  pdf_file_name: "../legends-walk/out/test.pdf",
  theme: "A5",
};

export const App = () => {
  const mungeData = (data, cats) =>
    data.reduce((acc, cur) => {
      let category = acc.find((cat) => cat.key === cur.type);
      if (!category) {
        category = {
          key: cur.type,
          label: cats[cur.type],
          children: [],
        };
        acc.push(category);
      }
      category.children.push({
        key: cur.slug,
        label: cur.title,
        selectable: true,
        leaf: true,
      });
      return acc;
    }, []);

  const [data, setData] = useState([]);
  const [categories, setCategories] = useState({});
  const [selections, setSelections] = useState(null);

  ipcRenderer.on("refresh", (event, { entries, categories }) => {
    const cats = categories.reduce((acc, { category, heading }) => {
      acc[category] = heading;
      return acc;
    }, {});
    setCategories(cats);
    setData(mungeData(entries, cats));
  });

  return (
    <>
      <main>
        <Toolbar>
          <div className="p-toolbar-group-left">
            <Button
              label="Open"
              icon="pi pi-folder-open"
              onClick={open}
              //   style={{ marginRight: ".25em" }}
            />
            <Button
              label="Refresh"
              icon="pi pi-refresh"
              onClick={refresh}
              //   style={{ marginRight: ".25em" }}
            />
            <Button
              label="Publish"
              icon="pi pi-file-pdf"
              onClick={pdf}
              //   style={{ marginRight: ".25em" }}
            />
          </div>
          {/* <div className="p-toolbar-group-right">
          </div> */}
        </Toolbar>

        <div id="panel">
          <Tree
            value={data}
            selectionMode="checkbox"
            selectionKeys={selections}
            onSelectionChange={(e) => setSelections(e.value)}
            style={{ width: "auto" }}
          />
        </div>
      </main>
    </>
  );
};

const pdf = () => {
  ipcRenderer.send("request-pdf", options);
};

const refresh = () => {
  ipcRenderer.send("request-refresh", options);
};

const open = () => {
  const directory = dialog.showOpenDialogSync({
    properties: ["openDirectory"],
  });
  if (typeof directory === "undefined") return;
  options.project = directory[0];
  options.baseName = `${options.project}/out/auto`;
  options.html_file_name = `${options.baseName}.html`;
  options.embedded_html_file_name = `${options.baseName}-complete.html`;
  options.pdf_file_name = `${options.baseName}.pdf`;
  refresh();
};

// console.log("Hello, world");
// const { ipcRenderer } = require('electron');
// document
// .querySelector('#elem')
// .addEventListener('click', () => {
//   ipcRenderer.send('click');
// });
