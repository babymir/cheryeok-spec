/*
 * 화면 요소를 안전하게 만드는 작은 도우미 (문자열은 모두 textContent 로 넣는다)
 *   h("div", { class: "card" }, "글자", h("b", null, "굵게"))
 *   mount(부모요소, 자식들...)  → 부모 안을 비우고 새로 채운다
 */
(function (root) {
  "use strict";

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(el, c); });
      return;
    }
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "style") el.setAttribute("style", v);
        else if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "href" || k === "src") {
          // http(s) 주소만 허용
          if (/^https?:\/\//.test(String(v))) el.setAttribute(k, v);
        } else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function mount(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    for (var i = 1; i < arguments.length; i++) append(parent, arguments[i]);
    return parent;
  }

  function link(href, text) {
    return h("a", { href: href, target: "_blank", rel: "noopener" }, text);
  }

  root.Dom = { h: h, mount: mount, link: link };
})(this);
