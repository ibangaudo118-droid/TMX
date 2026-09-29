// app/api/webhook/github/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const action = payload.action;
    const pullRequest = payload.pull_request;
    const repository = payload.repository;

    // Only process opened and synchronized pull requests
    if (
      !pullRequest ||
      !repository ||
      !["opened", "synchronize"].includes(action)
    ) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const prNumber = pullRequest.number;
    const diffUrl = pullRequest.diff_url;
    const owner = repository.owner.login;
    const repo = repository.name;

    if (!diffUrl) {
      return NextResponse.json(
        { error: "Pull request diff URL is missing" },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is not configured");
    }

    // Fetch the pull request diff
    const diffResponse = await fetch(diffUrl, {
      headers: {
        Accept: "application/vnd.github.v3.diff",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
    });

    if (!diffResponse.ok) {
      throw new Error(
        `Failed to fetch GitHub diff: ${diffResponse.status} ${diffResponse.statusText}`
      );
    }

    const diff = await diffResponse.text();

    // Send the diff to Groq for security analysis
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
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
                "You are a security-focused code reviewer. Scan the provided GitHub code diff strictly for security flaws. Look for issues such as exposed API keys, hardcoded credentials, SQL injection, command injection, authentication/authorization flaws, insecure handling of secrets, and other concrete security vulnerabilities. Do not report style issues, performance issues, or general code quality concerns. Give a clear, concise summary of any findings. If there are no security flaws, say exactly: No security issues found.",
            },
            {
              role: "user",
              content: `Review this GitHub pull request diff strictly for security flaws:\n\n${diff}`,
            },
          ],
          temperature: 0,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();

      throw new Error(
        `Groq API request failed: ${groqResponse.status} ${errorText}`
      );
    }

    const groqData = await groqResponse.json();

    const securitySummary =
      groqData.choices?.[0]?.message?.content?.trim() ||
      "No security issues found.";

    // Post the security summary as a GitHub PR comment
    const commentResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(repo)}/issues/${prNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          body: `## 🔐 Security Scan\n\n${securitySummary}`,
        }),
      }
    );

    if (!commentResponse.ok) {
      const errorText = await commentResponse.text();

      throw new Error(
        `Failed to post GitHub comment: ${commentResponse.status} ${errorText}`
      );
    }

    console.log(
      `Security scan completed for ${owner}/${repo}#${prNumber}`
    );

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("GitHub security webhook error:", error);

    return NextResponse.json(
      { error: "Failed to process GitHub webhook" },
      { status: 500 }
    );
  }
        }
