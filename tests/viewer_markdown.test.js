// Run: node tests/viewer_markdown.test.js (offline, no browser or network dependency).
const assert = require("node:assert/strict");
const Markdown = require("../extension/viewer/markdown.js");
const render = (text) => Markdown.format(text);

// Headings: the raw ### markers must never reach the recipient.
const heading = render("### Your monthly money plan\n\nSave first.");
assert(heading.includes("<h3>Your monthly money plan</h3>"));
assert(!heading.includes("###"));

assert(render("# One\n## Two\n###### Six").includes("<h1>One</h1>"));
assert(render("# One\n## Two\n###### Six").includes("<h6>Six</h6>"));

// Inline formatting, and arithmetic asterisks left alone.
assert(render("**Bold** and `code`").includes("<strong>Bold</strong>"));
assert(render("**Bold** and `code`").includes("<code>code</code>"));
assert(render("This is *important*.").includes("<em>important</em>"));
const arithmetic = render("The share is 0.25 * <S1> of the total.");
assert(arithmetic.includes("0.25 * &lt;S1&gt;"), "a lone asterisk is multiplication, not emphasis");
assert(!arithmetic.includes("<em>"));

// Inline code is not re-formatted by the bold rule.
const codeWithStars = render("`a ** b`");
assert(codeWithStars.includes("<code>a ** b</code>"));
assert(!codeWithStars.includes("<strong>"));

// Links: absolute http(s) only.
const link = render("[docs](https://example.org/a)");
assert(link.includes('<a href="https://example.org/a" target="_blank" rel="noopener noreferrer">docs</a>'));
assert(!render("[x](javascript:alert(1))").includes("<a "));
assert(!render("[x](data:text/html,hi)").includes("<a "));

// Untrusted text is escaped before any tag is added.
const xss = render('<script>alert(1)</script> <img src=x onerror=alert(1)>');
assert(!xss.includes("<script>"));
assert(!xss.includes("<img"));
assert(xss.includes("&lt;script&gt;"));

// Tables: separator row is dropped, first row becomes the header.
const table = render("| Item | Amount |\n| --- | --- |\n| Rent | $1,200 |");
assert(table.includes("<thead><tr><th>Item</th><th>Amount</th></tr></thead>"));
assert(table.includes("<tbody><tr><td>Rent</td><td>$1,200</td></tr></tbody>"));
assert(!table.includes("---"));

// The viewer appends an invisible forensic watermark to the end of the message.
// It must not break the last table row, and it must stay in the rendered text.
const watermarked = render("| Item | Amount |\n| --- | --- |\n| Rent | $1,200 |\uFEFF\u200C\u200B");
assert(watermarked.includes("<td>Rent</td>"));
assert(watermarked.includes("$1,200"));
assert(watermarked.includes("\uFEFF"), "watermark is preserved");
assert(!watermarked.includes("| --- |"));

// Lists and blockquotes.
assert(render("- one\n- two").includes("<ul><li>one</li><li>two</li></ul>"));
assert(render("1. one\n2. two").includes("<ol><li>one</li><li>two</li></ol>"));
assert(render("> quoted line").includes("<blockquote>quoted line</blockquote>"));

// Fenced code keeps its content literal and escaped.
const fence = render("```js\nif (a < b) alert(1)\n```");
assert(fence.includes('<pre><code class="language-js">'));
assert(fence.includes("a &lt; b"));
assert(!fence.includes("<script>"));

// Plain paragraphs keep their line breaks without becoming headings or lists.
const paragraph = render("First line\nSecond line");
assert(paragraph.startsWith("<p>"));
assert(paragraph.includes("First line<br>Second line"));

console.log("viewer markdown: all assertions passed");
