window.__ModuleLoader__.load({
	id: "dsh-plugin-archive-folder",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var h = react.createElement;

		var css = ".dshaf-cell{display:inline-flex;align-items:center;gap:6px;position:relative}.dshaf-btn{cursor:pointer;border:1px solid #555;background:#2a2a2a;color:#eee;border-radius:6px;padding:3px 10px;font-size:12px;line-height:1.5}.dshaf-btn:disabled{cursor:default;opacity:.6}.dshaf-pop{position:absolute;top:100%;right:0;margin-top:4px;background:#1e1e1e;color:#eee;border:1px solid #555;border-radius:8px;padding:8px;min-width:420px;max-width:560px;max-height:56vh;overflow:auto;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,.4)}.dshaf-pop h4{margin:0 0 6px;font-size:11px;color:#ccc;font-weight:400}.dshaf-item{display:block;position:relative;padding:6px 4px;border-bottom:1px solid #3a3a3a;font-size:12px;cursor:pointer;color:#eee;border-radius:4px}.dshaf-item:hover{background:#333}.dshaf-line{font-size:12px;color:#eee;padding-right:34px}.dshaf-sub{font-size:10px;color:#9e9e9e;margin-top:1px;padding-right:34px}.dshaf-more{position:absolute;top:50%;right:6px;transform:translateY(-50%);cursor:pointer;border:1px solid #555;background:#2a2a2a;border-radius:4px;padding:4px 4px;display:inline-flex;gap:2px;align-items:center;line-height:0}.dshaf-dot{width:2px;height:2px;border-radius:50%;background:#ddd;display:inline-block}.dshaf-menu{position:absolute;top:calc(50% - 2px);right:6px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:6px;overflow:hidden;z-index:510;box-shadow:0 4px 16px rgba(0,0,0,.4);min-width:110px}.dshaf-menu div{padding:5px 10px;font-size:12px;cursor:pointer}.dshaf-menu div:hover{background:#3d3d3d}.dshaf-empty{font-size:11px;color:#aaa}.dshaf-errbox{font-size:11px;color:#ff8a80;background:#3a1a1a;border:1px solid #8c4a48;border-radius:4px;padding:4px 6px;margin-bottom:6px;word-break:break-all}.dshaf-banner{position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:1000;background:#3a1a1a;color:#ff8a80;border:1px solid #8c4a48;border-radius:8px;padding:10px 16px;font-size:13px;box-shadow:0 4px 18px rgba(0,0,0,.5);max-width:80vw}";
		var tagId = "dsh-plugin-archive-folder/style.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-archive-folder";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		function call(op, args) {
			var payload = Object.assign({ op: op }, args || {});
			return fetch("/archive-folder", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			}).then(function (r) { return r.json(); });
		}

		var inject = ["sessions", "slots", "timer"];

		function apply(ctx) {
			var timer = ctx.timer;
			var notice = null;
			var subs = new Set();
			function subscribe(f) { subs.add(f); f(notice); return function () { subs.delete(f); }; }
			function setNotice(n) { notice = n; subs.forEach(function (f) { f(notice); }); }

			function Notice() {
				var st = react.useState(notice);
				var n = st[0];
				var setN = st[1];
				react.useEffect(function () { return subscribe(setN); }, []);
				react.useEffect(function () {
					if (!n) return;
					return timer.timeout(function () { setNotice(null); }, 4000);
				}, [n]);
				if (!n) return null;
				return h("div", { className: "dshaf-banner", title: "点击关闭", onClick: function () { setNotice(null); } }, n);
			}

			function Action(props) {
				var sessionId = props && props.sessionId;
				var s1 = react.useState(null); var state = s1[0]; var setState = s1[1];
				var s2 = react.useState(false); var open = s2[0]; var setOpen = s2[1];
				var s3 = react.useState(null); var list = s3[0]; var setList = s3[1];
				var s4 = react.useState(null); var errBox = s4[0]; var setErrBox = s4[1];
				var s5 = react.useState(null); var restoring = s5[0]; var setRestoring = s5[1];
				var s6 = react.useState(null); var menuPath = s6[0]; var setMenuPath = s6[1];

				function store() {
					if (state === "busy" || !sessionId) return;
					setState("busy"); setErrBox(null);
					call("store", { sessionId: sessionId }).then(function (res) {
						setState(null);
						if (res && res.ok) { setNotice("已归档到「归档文件夹」"); setState("done"); setList(null); }
						else setNotice((res && res.error) || "归档失败");
					}).catch(function () { setState(null); setNotice("归档失败"); });
				}

				function toggle() {
					var next = !open;
					setOpen(next); setMenuPath(null);
					if (next && list === null) {
						call("list", { sessionId: sessionId }).then(function (res) {
							setList(res && res.ok ? (res.items || []) : []);
							setErrBox(null);
						}).catch(function () { setList([]); });
					}
				}

				function resume(path) {
					if (restoring) return;
					setRestoring(path); setErrBox(null); setMenuPath(null);
					call("restore", { file: path }).then(function (res) {
						setRestoring(null);
						if (!res || !res.ok) { setNotice((res && res.error) || "恢复失败"); return; }
						var sourceId = res.sourceSessionId;
						if (!sourceId) { setNotice("存档里没有原始会话ID，无法恢复"); return; }
						if (!ctx.sessions || !ctx.sessions.fork) { setNotice("无法访问会话分叉功能"); return; }
						var opts = { sessionId: sourceId };
						if (typeof res.anchorSeq === "number") opts.atSeq = res.anchorSeq;
						ctx.sessions.fork(opts).then(function (newId) {
							setOpen(false);
							if (ctx.sessions.open) ctx.sessions.open(newId);
							if (res.title) {
								call("name", { sessionId: newId, title: res.title + (res.timeLabel ? " - " + res.timeLabel : "") });
							}
							setNotice("已恢复到新会话（标题带归档时间），可继续聊天");
						}).catch(function (e) { setNotice("恢复失败: " + String((e && e.message) || e)); });
					}).catch(function (e) { setRestoring(null); setNotice("恢复失败: " + String((e && e.message) || e)); });
				}

				function del(path) {
					setMenuPath(null); setErrBox(null);
					call("del", { file: path }).then(function (res) {
						if (res && res.ok) { setList((list || []).filter(function (x) { return x.path !== path; })); }
						else setNotice((res && res.error) || "删除失败");
					}).catch(function () { setNotice("删除失败"); });
				}

				function toggleMenu(path, ev) {
					ev.stopPropagation();
					setMenuPath(function (cur) { return cur === path ? null : path; });
				}

				var children = [
					h("button", { key: "store", className: "dshaf-btn", onClick: store, disabled: state === "busy" || !sessionId },
						state === "busy" ? "归档中…" : (state === "done" ? "已归档" : "归档到文件夹")),
					h("button", { key: "toggle", className: "dshaf-btn", onClick: toggle },
						open ? "收起归档箱" : "归档箱"),
				];

				if (open) {
					var rows;
					if (list === null) {
						rows = h("div", { className: "dshaf-empty" }, "加载中…");
					} else if (!list.length) {
						rows = h("div", { className: "dshaf-empty" }, "还没有归档，先点「归档到文件夹」");
					} else {
						rows = list.map(function (it) {
							var itemChildren = [
								h("div", { key: "line", className: "dshaf-line", title: it.path }, it.title || it.name),
								h("div", { key: "sub", className: "dshaf-sub" }, (it.timeLabel || "") + (it.snippet ? " · " + it.snippet : "")),
								h("button", { key: "more", className: "dshaf-more", onClick: function (e) { toggleMenu(it.path, e); } },
									h("span", { className: "dshaf-dot" }),
									h("span", { className: "dshaf-dot" }),
									h("span", { className: "dshaf-dot" })),
							];
							if (menuPath === it.path) {
								itemChildren.push(h("div", {
									key: "menu", className: "dshaf-menu",
									onClick: function (e) { e.stopPropagation(); },
								},
									h("div", { onClick: function () { resume(it.path); } }, "恢复"),
									h("div", { onClick: function () { del(it.path); } }, "删除")));
							}
							if (restoring === it.path) {
								itemChildren.push(h("span", { key: "restoring", className: "dshaf-empty" }, "恢复中…"));
							}
							return h("div", {
								key: it.key, className: "dshaf-item", title: it.path,
								onClick: function () { resume(it.path); },
							}, itemChildren);
						});
					}
					var panelChildren = [h("h4", { key: "title" }, "归档文件夹")];
					if (errBox) panelChildren.push(h("div", { key: "err", className: "dshaf-errbox" }, errBox));
					panelChildren.push(rows);
					children.push(h("div", { key: "pop", className: "dshaf-pop" }, panelChildren));
				}

				return h("span", { className: "dshaf-cell" }, children);
			}

			ctx.slots.inject("shell.overlay", function () {
				return ctx.slots.register({ name: "shell.overlay", id: "archive-notice", order: 0 }, Notice);
			});
			ctx.slots.inject("conversation.session.header.actions", function () {
				return ctx.slots.register({ name: "conversation.session.header.actions", id: "archive-to-folder", order: 30 }, Action);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
