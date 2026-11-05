(function () {
  "use strict";
 
  var STORAGE_KEY = "apex_analytics_state_v1";
  var BTC_ENDPOINT = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
  var BTC_REFRESH_MS = 30000;
 
  var state = {
    assets: []
  };
 
  var chartInstance = null;
  var lastBtcPrice = null;
 
  var currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
 
  var el = {
    clock: document.getElementById("liveClock"),
    resetBtn: document.getElementById("resetBtn"),
    statTotal: document.getElementById("statTotal"),
    statCount: document.getElementById("statCount"),
    statBtc: document.getElementById("statBtc"),
    statBtcSub: document.getElementById("statBtcSub"),
    form: document.getElementById("assetForm"),
    nameInput: document.getElementById("assetName"),
    amountInput: document.getElementById("assetAmount"),
    formError: document.getElementById("formError"),
    ledgerBody: document.getElementById("ledgerBody"),
    chartCanvas: document.getElementById("distributionChart"),
    chartEmpty: document.getElementById("chartEmpty")
  };
 
  /* ---------- Persistence ---------- */
 
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.assets)) {
        state.assets = parsed.assets.filter(function (item) {
          return item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.amount === "number" &&
            isFinite(item.amount) &&
            typeof item.createdAt === "string";
        });
      }
    } catch (err) {
      state.assets = [];
    }
  }
 
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showError("Storage is unavailable. Changes will not persist after reload.");
    }
  }
 
  /* ---------- Helpers ---------- */
 
  function generateId() {
    var stamp = Date.now().toString(36).toUpperCase();
    var rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return "TX-" + stamp + "-" + rand;
  }
 
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
 
  function formatTimestamp(isoString) {
    var date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return "Unknown";
    }
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }
 
  function showError(message) {
    el.formError.textContent = message;
  }
 
  function clearError() {
    el.formError.textContent = "";
  }
 
  function getTotal() {
    return state.assets.reduce(function (sum, item) {
      return sum + item.amount;
    }, 0);
  }
 
  /* ---------- Clock ---------- */
 
  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }
 
  function updateClock() {
    var now = new Date();
    var dateText = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric"
    });
    var timeText = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
    el.clock.textContent = dateText + "  |  " + timeText;
  }
 
  function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }
 
  /* ---------- Rendering ---------- */
 
  function renderStats() {
    el.statTotal.textContent = currencyFormatter.format(getTotal());
    el.statCount.textContent = String(state.assets.length);
  }
 
  function renderTable() {
    if (state.assets.length === 0) {
      el.ledgerBody.innerHTML =
        '<tr class="empty-row"><td colspan="4">The ledger is empty. Allocate capital to create your first entry.</td></tr>';
      return;
    }
 
    var rows = state.assets.map(function (item) {
      return (
        "<tr>" +
          "<td>" +
            '<div class="cell-id">' + escapeHtml(item.id) + "</div>" +
            '<div class="cell-time">' + escapeHtml(formatTimestamp(item.createdAt)) + "</div>" +
          "</td>" +
          "<td>" + escapeHtml(item.name) + "</td>" +
          '<td class="cell-amount">' + escapeHtml(currencyFormatter.format(item.amount)) + "</td>" +
          '<td class="text-right">' +
            '<button type="button" class="btn-delete" data-id="' + escapeHtml(item.id) + '">Delete</button>' +
          "</td>" +
        "</tr>"
      );
    });
 
    el.ledgerBody.innerHTML = rows.join("");
  }
 
  function getChartData() {
    var grouped = {};
    state.assets.forEach(function (item) {
      var key = item.name.trim();
      grouped[key] = (grouped[key] || 0) + item.amount;
    });
    var labels = Object.keys(grouped);
    var values = labels.map(function (label) {
      return grouped[label];
    });
    return { labels: labels, values: values };
  }
 
  var chartPalette = [
    "#6366f1", "#06b6d4", "#22c55e", "#f59e0b", "#ec4899",
    "#8b5cf6", "#14b8a6", "#ef4444", "#3b82f6", "#eab308"
  ];
 
  function buildColors(count) {
    var colors = [];
    for (var i = 0; i < count; i++) {
      colors.push(chartPalette[i % chartPalette.length]);
    }
    return colors;
  }
 
  function renderChart() {
    var data = getChartData();
    var hasData = data.values.length > 0;
 
    el.chartEmpty.classList.toggle("hidden", hasData);
 
    if (typeof window.Chart === "undefined") {
      el.chartEmpty.classList.remove("hidden");
      el.chartEmpty.textContent = "Chart library could not be loaded. Check your network connection.";
      return;
    }
 
    if (!chartInstance) {
      chartInstance = new window.Chart(el.chartCanvas.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: buildColors(data.values.length),
            borderColor: "#1e293b",
            borderWidth: 3,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: "#cbd5e1",
                usePointStyle: true,
                padding: 16,
                font: { size: 12 }
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  var total = context.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                  var percent = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : "0.0";
                  return " " + context.label + ": " + currencyFormatter.format(context.parsed) + " (" + percent + "%)";
                }
              }
            }
          }
        }
      });
      return;
    }
 
    chartInstance.data.labels = data.labels;
    chartInstance.data.datasets[0].data = data.values;
    chartInstance.data.datasets[0].backgroundColor = buildColors(data.values.length);
    chartInstance.update();
  }
 
  function renderAll() {
    renderStats();
    renderTable();
    renderChart();
  }
 
  /* ---------- Actions ---------- */
 
  function addAsset(name, amount) {
    state.assets.unshift({
      id: generateId(),
      name: name,
      amount: amount,
      createdAt: new Date().toISOString()
    });
    saveState();
    renderAll();
  }
 
  function deleteAsset(id) {
    state.assets = state.assets.filter(function (item) {
      return item.id !== id;
    });
    saveState();
    renderAll();
  }
 
  function resetData() {
    if (state.assets.length === 0) {
      return;
    }
    var confirmed = window.confirm("This will permanently remove all ledger entries. Continue?");
    if (!confirmed) {
      return;
    }
    state.assets = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      showError("Could not clear stored data.");
    }
    renderAll();
  }
 
  /* ---------- Events ---------- */
 
  function handleSubmit(event) {
    event.preventDefault();
    clearError();
 
    var name = el.nameInput.value.trim();
    var amount = parseFloat(el.amountInput.value);
 
    if (name.length === 0) {
      showError("Please enter an asset name.");
      el.nameInput.focus();
      return;
    }
 
    if (!isFinite(amount) || amount <= 0) {
      showError("Please enter a valid capital amount greater than zero.");
      el.amountInput.focus();
      return;
    }
 
    if (amount > 1e12) {
      showError("Amount exceeds the maximum allowed allocation.");
      el.amountInput.focus();
      return;
    }
 
    addAsset(name, Math.round(amount * 100) / 100);
    el.form.reset();
    el.nameInput.focus();
  }
 
  function handleTableClick(event) {
    var target = event.target;
    if (target && target.classList && target.classList.contains("btn-delete")) {
      deleteAsset(target.getAttribute("data-id"));
    }
  }
 
  /* ---------- BTC Feed ---------- */
 
  function setBtcError() {
    if (lastBtcPrice === null) {
      el.statBtc.textContent = "Unavailable";
    }
    el.statBtcSub.textContent = "Feed offline. Retrying shortly.";
    el.statBtcSub.className = "stat-sub down";
  }
 
  function fetchBtcPrice() {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
 
    fetch(BTC_ENDPOINT, controller ? { signal: controller.signal } : undefined)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (json) {
        if (!json || !json.bitcoin || typeof json.bitcoin.usd !== "number") {
          throw new Error("Unexpected payload");
        }
 
        var price = json.bitcoin.usd;
        var change = json.bitcoin.usd_24h_change;
        lastBtcPrice = price;
 
        el.statBtc.textContent = currencyFormatter.format(price);
 
        if (typeof change === "number" && isFinite(change)) {
          var sign = change >= 0 ? "+" : "";
          el.statBtcSub.textContent = sign + change.toFixed(2) + "% in 24h";
          el.statBtcSub.className = "stat-sub " + (change >= 0 ? "up" : "down");
        } else {
          el.statBtcSub.textContent = "Updated " + new Date().toLocaleTimeString("en-US", { hour12: false });
          el.statBtcSub.className = "stat-sub";
        }
      })
      .catch(function () {
        setBtcError();
      })
      .then(function () {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
  }
 
  function startBtcFeed() {
    fetchBtcPrice();
    setInterval(fetchBtcPrice, BTC_REFRESH_MS);
  }
 
  /* ---------- Init ---------- */
 
  function init() {
    loadState();
    startClock();
    renderAll();
    startBtcFeed();
 
    el.form.addEventListener("submit", handleSubmit);
    el.ledgerBody.addEventListener("click", handleTableClick);
    el.resetBtn.addEventListener("click", resetData);
    el.nameInput.addEventListener("input", clearError);
    el.amountInput.addEventListener("input", clearError);
  }
 
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
 

