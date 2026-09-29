import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const action = payload.action;
    const pullRequest = payload.pull_request;
    const repository = payload.repository;

    if (!pullRequest || !repository || !["opened", "synchronize"].includes(action)) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const prNumber = pullRequest.number;
    const owner = repository.owner.login;
    const repo = repository.name;

    if (!process.env.GROQ_API_KEY || !process.env.GITHUB_TOKEN) {
      console.error("Missing API keys in environment");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // Fetch diff via GitHub REST API endpoint directly instead of raw redirect URL
    const diffResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Accept: "application/vnd.github.v3.diff",
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "GitHub-Security-Bot",
        },
      }
    );

    if (!diffResponse.ok) {
      throw new Error(`Failed to fetch diff: ${diffResponse.status}`);
    }

    const diff = await diffResponse.text();

    // Send to Groq
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are a security code reviewer. Scan the diff for hardcoded credentials, API keys, or SQL injection. Give a concise summary of issues found.",
          },
          {
            role: "user",
            content: `Scan this diff:\n\n${diff}`,
          },
        ],
        temperature: 0,
      }),
    });

    if (!groqResponse.ok) {
      const err = await groqResponse.text();
      throw new Error(`Groq failed: ${err}`);
    }

    const groqData = await groqResponse.json();
    const securitySummary = groqData.choices?.[0]?.message?.content?.trim() || "No issues found.";

    // Post comment back to GitHub
    await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "GitHub-Security-Bot",
      },
      body: JSON.stringify({
        body: `## 🔐 Security Scan\n\n${securitySummary}`,
      }),
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
        }
  
