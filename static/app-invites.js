// "Invite someone to the app": ask for a person who can't sign in yet to be let into
// the app itself (not onto one list or trip), see your own requests and how many
// invites you have left, and withdraw one that is still waiting. The administrator
// decides on each request elsewhere (the app's Invites page).
//
// Used by every app with accounts and invites (lists, trip-planning), so they behave
// identically. It expects the app to serve, under `api`:
//   GET  {api}          the signed-in person's own requests: [{id, email, status, created_at}]
//   POST {api}          {email} -> the new request (status "approved" if they are the administrator)
//   DELETE {api}/{id}   withdraw one that is still waiting
// and GET /api/me (for how many invites are left). It builds its own markup (no element
// ids, so it can sit anywhere) and shows what went wrong right under the box. Styles are
// in theme.css.
//
//   const invites = AppInvites.mount(containerEl, {
//     appName: "Lists",                  // used in the wording
//     api: "/api/app-invites",           // optional, this is the default
//     onChange: () => { ... },           // after a request is made or withdrawn
//   });
//   invites.reload();

const AppInvites = (() => {
  const STATUS_TEXT = { pending: "Awaiting approval", approved: "Approved", declined: "Declined" };

  function mount(container, { appName, api = "/api/app-invites", onChange = () => {} }) {
    const send = (url, method, body) =>
      Global.fetchJSON(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

    const emailInput = Global.el("input", {
      type: "email",
      placeholder: "Email address",
      autocomplete: "off",
      // Not a sign-in field: keep password managers from attaching their own menu.
      "data-1p-ignore": "",
      "data-lpignore": "true",
      "data-bwignore": "true",
      "data-form-type": "other",
      "aria-label": `Email address of someone to invite to ${appName}`,
    });
    const sendBtn = Global.el("button", { type: "button", class: "secondary-btn", text: "Request invite" });
    const addRow = Global.el("div", { class: "member-add" }, [emailInput, sendBtn]);
    const problem = Global.el("p", { class: "field-hint is-error hidden" });
    const left = Global.el("p", { class: "field-hint" });
    const mine = Global.el("div", { class: "member-list" });
    const hint = Global.el("p", {
      class: "field-hint",
      text: `Ask for someone who can't sign in to ${appName} yet to be let in. An administrator approves each request, and they get an email saying how to sign in. Nothing is shared with them until you share it.`,
    });

    container.replaceChildren(hint, addRow, problem, left, Global.el("h3", { class: "section-subhead", text: "Your requests" }), mine);

    function showProblem(text) {
      problem.textContent = text || "";
      problem.classList.toggle("hidden", !text);
    }

    async function ask() {
      const email = emailInput.value.trim();
      if (!email) return;
      showProblem("");
      sendBtn.disabled = true;
      try {
        const invite = await send(api, "POST", { email });
        emailInput.value = "";
        Global.showMessage(
          invite.status === "approved"
            ? `${invite.email} has been let in.`
            : `Requested. ${invite.email} will be let in once it's approved.`,
          "success"
        );
        onChange();
      } catch (err) {
        showProblem(err.message);
      }
      sendBtn.disabled = false;
      reload();
    }

    async function withdraw(invite) {
      try {
        await send(`${api}/${invite.id}`, "DELETE");
        onChange();
      } catch (err) {
        showProblem(err.message);
      }
      reload();
    }

    function row(invite) {
      const el = Global.el("div", { class: "member-row" }, [
        Global.el("span", { class: "member-email", text: invite.email }),
        Global.el("span", { class: "item-badge item-badge-muted", text: STATUS_TEXT[invite.status] || invite.status }),
      ]);
      if (invite.status === "pending") {
        const button = Global.el("button", { type: "button", class: "cancel-btn", text: "Withdraw" });
        button.addEventListener("click", () => withdraw(invite));
        el.appendChild(button);
      }
      return el;
    }

    async function reload() {
      // Fresh each time (not Global.currentUser(), which is cached for the page): the
      // number of invites left changes as people are asked for.
      try {
        const me = await Global.fetchJSON("/api/me");
        left.textContent =
          me.invites_left === null || me.invites_left === undefined
            ? "You can invite as many people as you like."
            : `You have ${me.invites_left} invite${me.invites_left === 1 ? "" : "s"} left.`;
      } catch (err) {
        left.textContent = "";
      }
      try {
        const requests = await Global.withLoading(mine, Global.fetchJSON(api));
        mine.replaceChildren(
          ...(requests.length ? requests.map(row) : [Global.el("p", { class: "field-hint", text: "You haven't asked for anyone yet." })])
        );
      } catch (err) {
        mine.replaceChildren(Global.el("p", { class: "field-hint", text: err.message }));
      }
    }

    sendBtn.addEventListener("click", ask);
    emailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ask();
      }
    });
    emailInput.addEventListener("input", () => showProblem(""));

    reload();
    return { reload };
  }

  return { mount };
})();
