document.addEventListener('DOMContentLoaded',async function(){
	//get current streamer name
	const getStreamerName = () => {
		return new Promise((resolve, reject) => {
			chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
				if (tabs && tabs.length > 0) {
					const url = tabs[0].url;
					const streamername = new URL(url).pathname.split('/')[1];
					if(!url.includes("twitch.tv")){
						chrome.tabs.create({ url: "https://www.twitch.tv/" });
					}
					resolve(streamername);
				} else {
					console.error("Nie można uzyskać informacji o aktualnej karcie.");
					reject("Nie można uzyskać informacji o aktualnej karcie.");
				}
			});
		});
	}
	let searchTimeout;
	const streamername = await getStreamerName();
	const idLink = `https://api.streamelements.com/kappa/v2/channels/${streamername}`;
	const getId = async () => {
		return fetch(idLink, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
		})
		.then((response) => {
			if (response.ok) {
				return response.json();
			}
		})
		.then((data) => {
			return data["_id"];
		})
		.catch(error=>{
			console.warn('Error while getting streamer id: ', error);
			return "";
		});
	}
	const id = await getId();

	const StreamElementsCommandsLink1 = `https://api.streamelements.com/kappa/v2/bot/commands/${id}`;
	const StreamElementsCommandsLink2 = `https://api.streamelements.com/kappa/v2/bot/commands/${id}/default`;
	const StreamElementsSongsLink1 = `https://api.streamelements.com/kappa/v2/songrequest/${id}/playing`;
	const StreamElementsSongsLink2 = `https://api.streamelements.com/kappa/v2/songrequest/${id}/queue/public`;
	const TTVUpdatesCommandsLink = `https://corsproxy.io/?https://ttvu.link/dashboard/commands/${streamername}`;

	const getTTVU = async () => {
		return fetch(TTVUpdatesCommandsLink)
		.then(response => response.text())
		.then(html => {
			const parser = new DOMParser();
			const dom = parser.parseFromString(html, 'text/html');
			const a = dom.querySelectorAll('tbody>tr');
			let x = [];
			a.forEach(function(e){
				if(e.querySelectorAll('td')[1].innerText == 'Everyone'){
					x.push({'command': e.querySelectorAll('td')[0].innerText.split('!')[1], 'description':e.querySelectorAll('td')[2].innerText});
				}
			});
			return x;
		})
		.catch(error=>{
			console.warn('Error while getting TTV Updates: ', error);
			return [];
		});
	}

	const getSE = async () => {
		try{
			const [response1, response2] = await Promise.all([
				fetch(StreamElementsCommandsLink1, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' },
				}),
				fetch(StreamElementsCommandsLink2, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' },
				}),
			]);
		
			if (!response1.ok || !response2.ok) {
				console.log("Not ok response");
			}
		
			const [data1, data2] = await Promise.all([response1.json(), response2.json()]);
		
			const commands = [];
		
			for (let row of data1) {
				if (row["enabled"] === true && row["accessLevel"] === 100) {
					commands.push({ "command": row["command"], "description": row["reply"] });
				}
			}
		
			for (let row of data2) {
				if (row["enabled"] === true && row["accessLevel"] === 100) {
					commands.push({ "command": row["command"], "description": row["description"] });
				}
			}
		
			const uniqueCommands = commands.filter((command, index, self) =>
				index === self.findIndex(obj => obj.command === command.command)
			);
		
			const sortedCommands = [...uniqueCommands];
		
			sortedCommands.sort((a, b) => a.command.localeCompare(b.command));
		
			return sortedCommands;
		}
		
		catch(error){
			console.warn('Error while getting StreamElements Commands: ', error);
			return [];
		}
	}

	const commands = async () => {
		const ttvu = await getTTVU();
		const se = await getSE();
		return se.concat(ttvu);
	}

	const getSongs = async () => {
		try {
			const [response1, response2] = await Promise.all([
				fetch(StreamElementsSongsLink1, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' },
				}).catch(error => {
					if (error && error.message && error.message.includes("Failed to fetch")) {
						console.error("Failed to fetch StreamElementsSongsLink1");
					}
					throw error;
				}),
				fetch(StreamElementsSongsLink2, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' },
				}).catch(error => {
					if (error && error.message && error.message.includes("Failed to fetch")) {
						console.error("Failed to fetch StreamElementsSongsLink2");
					}
					throw error;
				}),
			]);
	
			if (!response1.ok || !response2.ok) {
				console.error("Not ok response");
				return [];
			}
	
			const [data1, data2] = await Promise.all([response1.json(), response2.json()]);
	
			let songs = [];
			let item = {};
			if (data1 != undefined && data1["title"] != undefined) {
				item["title"] = data1["title"] != undefined ? data1["title"] : "Unknown title";
				item["videoId"] = data1["videoId"] != undefined ? data1["videoId"] : undefined;
				item["user"] = data1["user"] != undefined ? (data1["user"]["username"] != undefined ? data1["user"]["username"] : "Unknown user") : "Unknown user";
				item["playing"] = true;
				songs.push(item);
			}
			if (data2 != undefined && data2.length > 0) {
				for (let row of data2) {
					let item = {};
					item["title"] = row["title"] != undefined ? row["title"] : "Unknown title";
					item["videoId"] = row["videoId"] != undefined ? row["videoId"] : undefined;
					item["user"] = row["user"]["username"] != undefined ? (row["user"]["username"] != undefined ? row["user"]["username"] : "Unknown user") : "Unknown user";
					songs.push(item);
				}
			}
			return songs;
		} catch (error) {
			if (error.message === "Unexpected end of JSON input") {
				console.info('%cUnexpected end of JSON: %cMost likely streamer hasn\'t enabled functionality', 'color: red; font-size: 2em;', 'font-size: 1.5em;');
			} else {
				console.warn('Error while getting streamer song queue: ', error);
			}
			return [];
		}
	}
	

	function openTab(tab) {
		if (tab === "commands") {
			document.getElementById("commands").classList.add("active");
			document.getElementById("songs").classList.remove("active");
			document.getElementById("list").style.display = "block";
			document.getElementById("songsTab").style.display = "none";
		}
		else {
			document.getElementById("commands").classList.remove("active");
			document.getElementById("songs").classList.add("active");
			document.getElementById("list").style.display = "none";
			document.getElementById("songsTab").style.display = "block";
		}
	}

	function buttonClick(command) {
		navigator.clipboard.writeText("!"+command+" ")
		//TODO: add posibility to write command to chat and send it
	}

	chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
		if (!chrome.runtime.lastError) {
			const activeTab = tabs[0];
			chrome.scripting.executeScript({
				target: { tabId: activeTab.id },
				function: () => {
					return document.getElementsByTagName('html')[0].classList.contains('tw-root--theme-dark');
				}
			}).then((result) => {
				let htmlTag = document.querySelector('body');
				if (!result[0].result) {
					htmlTag.classList.replace("dark","light");
					document.querySelectorAll("img").forEach((e)=>{
						e.src = "media/refresh.svg"
					});
				}
			});
		}
		else{
			console.error("Error: " + chrome.runtime.lastError.message);
		}
	});
	document.getElementById("commands").addEventListener("click", async () => { 
		openTab("commands");
	});
	document.getElementById("songs").addEventListener("click", async () => { 
		openTab("songs");
	});
	const list = document.getElementById("list");
	const songsTab = document.getElementById("songsTab");
	const divList = document.createElement("div");
	const divSongs = document.createElement("div");
	divList.style.width = "100%";
	divSongs.style.width = "100%";
	list.appendChild(divList);
	songsTab.append(divSongs);

	async function addToCommands(searchCondition = "") {
		divList.innerText = "";
		document.getElementsByClassName("cmd")[0].classList.add("loader");
		let command = await commands();
		if (searchCondition != "") {
			let a = [];
			command.forEach(function (e) {
				if (e.command.includes(searchCondition) || e.description.includes(searchCondition)) {
					a.push(e);
				}
			});
			command = a;
		}
		if(command.length>0){
			document.getElementsByClassName("cmd")[0].classList.remove("loader");
			command.forEach(function (output) {
				const u = document.createElement("div");
				u.classList.add("element");

				const div = document.createElement("div");
				div.classList.add("button");
				div.textContent = "!" + output.command;

				const text = document.createElement("p");
				text.textContent = output.description;

				const copy = document.createElement("img");
				copy.classList.add("copy", "copy-img");
				copy.alt = "Copy";
				copy.addEventListener("click", () => 
				{
					buttonClick(output.command);
					copy.classList.replace("copy-img", "copied-img");
					setTimeout(() => copy.classList.replace("copied-img", "copy-img"), 1500);
				});

				div.appendChild(copy);
				u.appendChild(div);
				u.appendChild(text);
				divList.appendChild(u);
			});
		}
		else{
			document.getElementsByClassName("cmd")[0].classList.remove("loader");
			const h3 = document.createElement("h3");
			h3.textContent = "No commands found.";
			divList.appendChild(h3);
		}
	}
	async function addToSongs(){
		divSongs.innerText = "";
		document.getElementsByClassName("song")[0].classList.add("loader");
		const songs = await getSongs()
		if(songs.length>0){
			document.getElementsByClassName("song")[0].classList.remove("loader");
			songs.forEach( (song)=>{
				const div = document.createElement("div");
				const div2 = document.createElement("div");
				div.classList.add("element");
				const a = document.createElement("a");
				const text = document.createElement("p");
				a.innerText = song["title"];
				if(song["playing"] === true) a.classList.add("playing");
				text.textContent = "Requesting user: "+song["user"];
				text.style.clear = "both";
				const userCopy = document.createElement("img");
				userCopy.classList.add("copy", "copy-img");
				userCopy.addEventListener("click", ()=> {
					navigator.clipboard.writeText("@"+song["user"]);
					userCopy.classList.replace("copy-img", "copied-img");
					setTimeout(() => userCopy.classList.replace("copied-img", "copy-img"), 1500);
				});
				text.appendChild(userCopy);
				div2.appendChild(a);
				div.appendChild(div2);
				div.appendChild(text);
				divSongs.appendChild(div);
				document.getElementById("songsTab").appendChild(divSongs);
				if(song["videoId"] != undefined){
					const copy = document.createElement("img");
					copy.classList.add("copy");
					copy.alt = "Copy";
					copy.classList.add("copy-img");
					const open = document.createElement("img");
					open.classList.add("open");
					open.alt = "Open in new page";
					open.classList.add("external");
					a.appendChild(copy);
					a.appendChild(open);
					open.addEventListener("click", () => window.open('https://youtu.be/'+song["videoId"], '_blank'));
					copy.addEventListener("click", () => {
						navigator.clipboard.writeText(song["title"]);
						copy.classList.replace("copy-img", "copied-img");
						setTimeout(() => {
							copy.classList.replace("copied-img", "copy-img");
						}, 1500);
					});
				}
			});
		}
		else{
			document.getElementsByClassName("song")[0].classList.remove("loader");
			const h3 = document.createElement("h3");
			h3.textContent = "No songs found.";
			divSongs.appendChild(h3);
		}
	}
	let lastSearchValue = "";
	const search = document.getElementById("search");
	document.querySelector("#list .refresh").addEventListener("click",async()=>{
		await addToCommands();
	});
	document.querySelector("#songsTab .refresh").addEventListener("click",async()=>{
		await addToSongs();
	});
	search.addEventListener("input", async function (event) {
		if (search.value.toLowerCase().trim() === "") {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(async function () {
				await addToCommands();
			}, 300);
		} else if (lastSearchValue === "" && event.inputType === "deleteContentBackward") {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(async function () {
				await addToCommands();
			}, 300);
		} else {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(async function () {
				await addToCommands(search.value.toLowerCase().trim());
			}, 300);
		}
		
		lastSearchValue = search.value.toLowerCase().trim();
	});
	await addToCommands();
	await addToSongs();
});