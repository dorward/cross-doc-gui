import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Toolbar } from "primereact/toolbar";
import { Button } from "primereact/button";
import { Tree } from "primereact/tree";

const { ipcRenderer } = require("electron");

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
              label="Refresh"
              icon="pi pi-refresh"
              onClick={refresh}
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

const refresh = () => {
  const options = {
      baseName: "out/heb-sed",
      project: "../legends-walk",
      html_file_name: "../legends-walk/out/test.html",
      embedded_html_file_name: "../legends-walk/out/test-complete.html",
      pdf_file_name: "../legends-walk/out/test.pdf",
      theme: "A5",
  };
  ipcRenderer.send("request-refresh", options);
};

// console.log("Hello, world");
// const { ipcRenderer } = require('electron');
// document
// .querySelector('#elem')
// .addEventListener('click', () => {
//   ipcRenderer.send('click');
// });
