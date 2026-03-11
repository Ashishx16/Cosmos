const https = require("https");
const http = require("http");

// Fetches a URL and returns the body as a string
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      },
      (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location).then(resolve).catch(reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const boardUrl = event.queryStringParameters && event.queryStringParameters.board;

  if (!boardUrl || !boardUrl.includes("cosmos.so")) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing or invalid board URL" }),
    };
  }

  try {
    const html = await fetchUrl(boardUrl);

    // Extract all cdn.cosmos.so image URLs
    const found = new Set();

    // Match src attributes
    const srcMatches = html.matchAll(/src=["'](https:\/\/cdn\.cosmos\.so\/[^"'?]+)[^"']*/g);
    for (const m of srcMatches) {
      found.add(m[1] + "?format=jpeg&w=1600");
    }

    // Match srcset / data-src
    const srcsetMatches = html.matchAll(/https:\/\/cdn\.cosmos\.so\/([a-f0-9-]{36})/g);
    for (const m of srcsetMatches) {
      found.add(`https://cdn.cosmos.so/${m[1]}?format=jpeg&w=1600`);
    }

    // Match JSON blobs (cosmos embeds image data as JSON in script tags)
    const uuidMatches = html.matchAll(/"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"/g);
    for (const m of uuidMatches) {
      // Filter out non-image UUIDs by checking context around the match
      const idx = html.indexOf(m[1]);
      const context = html.substring(Math.max(0, idx - 100), idx + 100);
      if (
        context.includes("cdn.cosmos") ||
        context.includes("image") ||
        context.includes("photo") ||
        context.includes("item")
      ) {
        found.add(`https://cdn.cosmos.so/${m[1]}?format=jpeg&w=1600`);
      }
    }

    const images = [...found];

    if (images.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          images: [],
          note: "No images found. Make sure the board is public and the URL is correct.",
        }),
      };
    }

    // Shuffle
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ images }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
