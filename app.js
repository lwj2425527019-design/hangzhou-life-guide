(() => {
  "use strict";

  const data = window.APP_DATA;
  if (!data) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<p class="noscript-warning">资料文件未能加载，请确认 data.js 与 index.html 在同一个文件夹。</p>',
    );
    return;
  }

  const state = {
    selectedDayIndex: 0,
    activeHomeTab: "laundry",
    weatherByDate: {},
    weatherFetchedAt: null,
  };

  const weatherLabels = {
    0: "晴",
    1: "大致晴朗",
    2: "局部多云",
    3: "阴",
    45: "有雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "较强毛毛雨",
    56: "轻微冻毛毛雨",
    57: "较强冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "轻微冻雨",
    67: "较强冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "小阵雨",
    81: "阵雨",
    82: "强阵雨",
    85: "小阵雪",
    86: "强阵雪",
    95: "雷暴",
    96: "雷暴伴小冰雹",
    99: "雷暴伴较强冰雹",
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function parseLocalDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(isoDate) {
    const date = parseLocalDate(isoDate);
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(date);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`;
  }

  function formatShortDate(isoDate) {
    const date = parseLocalDate(isoDate);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function getWeekday(isoDate) {
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(parseLocalDate(isoDate));
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // File URLs and privacy modes can disable storage; the page still works without persistence.
    }
  }

  function getInitialDayIndex() {
    const now = new Date();
    const today = toISODate(now);
    const index = data.dailyPlans.findIndex((item) => item.date === today);
    if (index >= 0) return index;
    if (today < data.meta.startDate) return 0;
    if (today > data.meta.endDate) return data.dailyPlans.length - 1;
    return 0;
  }

  function renderOverview() {
    $("#header-date").textContent = "2026.10.24 — 11.22";
    $("#overview-eyebrow").textContent = data.overview.eyebrow;
    $("#overview-intro").textContent = data.overview.intro;
    $("#forecast-boundary").textContent = data.meta.forecastBoundary;

    $("#priority-grid").innerHTML = data.overview.priorities
      .map(
        (item) => `
          <article class="priority-card">
            <span class="priority-icon" aria-hidden="true">${escapeHTML(item.icon)}</span>
            <h3>${escapeHTML(item.title)}</h3>
            <p>${escapeHTML(item.text)}</p>
          </article>
        `,
      )
      .join("");

    $("#quick-facts").innerHTML = data.overview.quickFacts
      .map((fact) => `<li>${escapeHTML(fact)}</li>`)
      .join("");

    const weatherTitle = $("#weather-heading");
    const weatherNote = $("#weather-note");
    weatherTitle.textContent = data.meta.weatherLabel;
    weatherNote.textContent = data.meta.weatherNote;
    $("#api-note").textContent =
      "刷新仅使用公开测试接口；它不是中国气象局发布，成功结果也请与中国天气网核对。";
  }

  function loadEmbeddedForecast() {
    data.forecast16.forEach((weather) => {
      state.weatherByDate[weather.date] = weather;
    });
    state.weatherFetchedAt = "2026-10-24T14:07:00+08:00";
  }

  function renderDaySelector() {
    const picker = $("#date-picker");
    picker.innerHTML = data.dailyPlans
      .map(
        (day, index) =>
          `<option value="${index}">${formatDate(day.date)} · 第${index + 1}天</option>`,
      )
      .join("");

    $("#day-strip").innerHTML = data.dailyPlans
      .map(
        (day, index) => `
          <button
            class="day-chip${index === 0 ? " is-today" : ""}"
            type="button"
            data-day-index="${index}"
            aria-label="${formatDate(day.date)}，${escapeHTML(day.phase)}"
          >
            <span>${getWeekday(day.date)}</span>
            <strong>${formatShortDate(day.date)}</strong>
          </button>
        `,
      )
      .join("");
  }

  function weatherForDate(isoDate) {
    return state.weatherByDate[isoDate] || null;
  }

  function renderWeatherMetrics(weather) {
    const metrics = $("#weather-metrics");
    if (!weather) {
      metrics.classList.remove("is-live");
      metrics.innerHTML = `
        <div><span>温度</span><strong>待更新</strong></div>
        <div><span>体感</span><strong>待更新</strong></div>
        <div><span>降雨</span><strong>待更新</strong></div>
        <div><span>湿度</span><strong>待更新</strong></div>
      `;
      return;
    }

    metrics.classList.add("is-live");
    const humidity =
      weather.humidityMax != null && weather.humidityMin != null
        ? `${Math.round(weather.humidityMin)}–${Math.round(weather.humidityMax)}%`
        : "未提供";
    metrics.innerHTML = `
      <div><span>温度</span><strong>${Math.round(weather.min)}–${Math.round(weather.max)}℃</strong></div>
      <div><span>体感</span><strong>${Math.round(weather.feelsMin)}–${Math.round(weather.feelsMax)}℃</strong></div>
      <div><span>降雨</span><strong>${weather.precipProbability ?? 0}%</strong></div>
      <div><span>湿度</span><strong>${humidity}</strong></div>
    `;
  }

  function renderSelectedDay(index) {
    state.selectedDayIndex = Math.min(Math.max(index, 0), data.dailyPlans.length - 1);
    const day = data.dailyPlans[state.selectedDayIndex];
    const weather = weatherForDate(day.date);

    $("#selected-count").textContent = `第${state.selectedDayIndex + 1}天 / 共30天`;
    $("#selected-date").textContent = formatDate(day.date);
    $("#selected-phase").textContent = `${day.phase} · ${data.weeks.find((week) => week.id === day.week)?.label || ""}`;
    $("#selected-headline").textContent = day.headline;
    $("#selected-focus").textContent = weather
      ? `【按这份预报穿衣】${buildWeatherAdjustment(weather)} 季节提醒：${day.focus}`
      : day.focus;
    $("#selected-food").textContent = day.food;
    $("#selected-sleep").textContent = day.sleep;
    $("#selected-home").textContent = day.home;

    const selectedWeather = $("#selected-weather");
    if (weather) {
      selectedWeather.innerHTML = `
        <span class="weather-placeholder-icon" aria-hidden="true">◌</span>
        <span>
          ${weatherLabels[weather.code] || "天气"} ·
          ${Math.round(weather.min)}–${Math.round(weather.max)}℃ ·
          降雨 ${weather.precipProbability ?? 0}% ·
          湿度 ${Math.round(weather.humidityMin)}–${Math.round(weather.humidityMax)}% ·
          最大风速 ${Math.round(weather.windMax)} km/h
        </span>
      `;
    } else if (state.selectedDayIndex > 15) {
      selectedWeather.innerHTML = `
        <span class="weather-placeholder-icon" aria-hidden="true">◌</span>
        <span>超出16天逐日预报范围 · 仅看季节参考</span>
      `;
    } else {
      selectedWeather.innerHTML = `
        <span class="weather-placeholder-icon" aria-hidden="true">☁</span>
        <span>具体天气待更新 · 以下只作季节参考</span>
      `;
    }

    $$(".day-chip").forEach((chip, chipIndex) => {
      const active = chipIndex === state.selectedDayIndex;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    $("#date-picker").value = String(state.selectedDayIndex);
    renderWeatherMetrics(weather);

    const activeChip = $(".day-chip.is-active");
    if (activeChip && window.innerWidth < 761) {
      activeChip.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }

  function buildWeatherAdjustment(weather) {
    const notes = [];
    const temperatureSpread = weather.max - weather.min;
    const rainy =
      (weather.precipProbability ?? 0) >= 35 ||
      (weather.precipitation ?? 0) >= 0.3 ||
      [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weather.code);

    if (weather.max >= 27) {
      notes.push("午后可穿短袖或薄长袖，但随身保留薄外层");
    } else if (weather.max <= 20) {
      notes.push("日间以长袖加薄针织/夹克为主");
    } else {
      notes.push("薄长袖配可脱薄外套较稳妥");
    }

    if (weather.min <= 11) {
      notes.push("早晚偏冷，加轻抓绒或薄保暖层");
    } else if (weather.min <= 15) {
      notes.push("早晚加一层针织衫或防风外套");
    }

    if (rainy) notes.push("准备折叠伞或轻雨衣，鞋袜选易干防滑款");
    if ((weather.windMax ?? 0) >= 18) notes.push("风力偏大，外层优先挡风并注意骑行安全");
    if ((weather.humidityMax ?? 0) >= 90) notes.push("湿度高，贴身衣物保持干爽");
    if (temperatureSpread >= 8) notes.push("昼夜温差大，不要只按午后温度穿衣");

    return notes.join("；") + "。";
  }

  function bindDayControls() {
    $("#day-strip").addEventListener("click", (event) => {
      const chip = event.target.closest("[data-day-index]");
      if (!chip) return;
      renderSelectedDay(Number(chip.dataset.dayIndex));
    });

    $("#date-picker").addEventListener("change", (event) => {
      renderSelectedDay(Number(event.target.value));
    });
  }

  function renderWeeks() {
    $("#week-list").innerHTML = data.weeks
      .map(
        (week) => `
          <article class="week-card">
            <div class="week-intro">
              <span class="week-number">${escapeHTML(week.label)}</span>
              <h3>${escapeHTML(week.phase)}</h3>
              <p>${escapeHTML(week.dates)}<br />${escapeHTML(week.weatherType)}</p>
            </div>
            <div class="week-body">
              <div class="week-summary">
                <p class="mini-label">这段时间怎么理解</p>
                <p>${escapeHTML(week.summary)}</p>
              </div>
              <div class="week-detail">
                <span class="mini-label">穿</span>
                <h4>穿衣重点</h4>
                <p>${escapeHTML(week.clothing)}</p>
              </div>
              <div class="week-detail">
                <span class="mini-label">眠</span>
                <h4>睡眠与被褥</h4>
                <p>${escapeHTML(week.sleep)}</p>
              </div>
              <div class="week-detail">
                <span class="mini-label">食</span>
                <h4>饮食采购</h4>
                <p>${escapeHTML(week.food)}</p>
              </div>
              <div class="week-detail">
                <span class="mini-label">家</span>
                <h4>居家防潮</h4>
                <p>先把湿衣、湿鞋和床品处理掉，再考虑添置设备。</p>
              </div>
              <div class="week-action"><strong>本周行动</strong>${escapeHTML(week.action)}</div>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function renderClothingTable() {
    $("#clothing-table-body").innerHTML = data.clothingTable
      .map(
        (row) => `
          <tr>
            <td>${escapeHTML(row.range)}</td>
            <td>${escapeHTML(row.feel)}</td>
            <td>${escapeHTML(row.top)}</td>
            <td>${escapeHTML(row.bottom)}</td>
            <td>${escapeHTML(row.outer)}</td>
            <td>${escapeHTML(row.shoes)}</td>
            <td>${escapeHTML(row.tip)}</td>
          </tr>
        `,
      )
      .join("");
  }

  function renderProduceList(items) {
    return items
      .map(
        (item) => `
          <li>
            <strong>${escapeHTML(item.name)}</strong>
            <span class="availability">${escapeHTML(item.availability)}</span>
            <span>${escapeHTML(item.use)}</span>
          </li>
        `,
      )
      .join("");
  }

  function renderFood() {
    $("#vegetable-list").innerHTML = renderProduceList(data.shopping.vegetables);
    $("#fruit-list").innerHTML = renderProduceList(data.shopping.fruits);
    $("#aquatic-list").innerHTML = renderProduceList(data.shopping.aquatic);
    $("#pantry-list").innerHTML = data.shopping.pantry
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join("");
    $("#shopping-note").textContent = data.shopping.note;

    $("#menu-grid").innerHTML = data.menu
      .map(
        (day) => `
          <article class="menu-card">
            <div class="menu-day">${escapeHTML(day.day)}</div>
            <div class="menu-content">
              <div class="meal-row"><span>早</span><p>${escapeHTML(day.breakfast)}</p></div>
              <div class="meal-row"><span>午</span><p>${escapeHTML(day.lunch)}</p></div>
              <div class="meal-row"><span>晚</span><p>${escapeHTML(day.dinner)}</p></div>
              <p class="menu-method">简单做法：${escapeHTML(day.method)}</p>
            </div>
          </article>
        `,
      )
      .join("");

    $("#print-menu").addEventListener("click", () => window.print());
  }

  function renderSleep() {
    $("#sleep-list").innerHTML = data.sleepGuide
      .map(
        (item) => `
          <div class="sleep-row">
            <div class="sleep-room">${escapeHTML(item.room)}</div>
            <div>
              <div class="sleep-cover">${escapeHTML(item.cover)}</div>
              <p class="sleep-action">${escapeHTML(item.action)}</p>
            </div>
          </div>
        `,
      )
      .join("");
  }

  const homeMeta = {
    laundry: { title: "阴雨天的晾衣顺序", label: "晾衣" },
    shoes: { title: "鞋袜轮换比猛烘更稳妥", label: "鞋袜" },
    bathroom: { title: "洗完澡别把湿气带进卧室", label: "洗澡" },
    damp: { title: "深秋防潮，先处理湿源", label: "防潮" },
  };

  function renderHome(tab = state.activeHomeTab) {
    state.activeHomeTab = tab;
    const meta = homeMeta[tab];
    const tips = data.homeTips[tab] || [];
    $("#home-panel").innerHTML = `
      <div class="home-panel-heading">
        <h3>${escapeHTML(meta.title)}</h3>
        <span>${escapeHTML(meta.label)}</span>
      </div>
      <div class="home-tip-grid">
        ${tips.map((tip) => `<div class="home-tip">${escapeHTML(tip)}</div>`).join("")}
      </div>
    `;

    $$(".home-tab").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function bindHomeTabs() {
    $$(".home-tab").forEach((button) => {
      button.addEventListener("click", () => renderHome(button.dataset.tab));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = $$(".home-tab");
        const current = tabs.indexOf(button);
        let target = current;
        if (event.key === "ArrowRight") target = (current + 1) % tabs.length;
        if (event.key === "ArrowLeft") target = (current - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = tabs.length - 1;
        tabs[target].focus();
        renderHome(tabs[target].dataset.tab);
      });
    });
  }

  function renderCommute() {
    const savedChecks = new Set(JSON.parse(safeStorageGet("hz-daily-checks") || "[]"));
    $("#daily-check-list").innerHTML = data.commute.dailyCheck
      .map((item, index) => {
        const checked = savedChecks.has(index);
        return `
          <label class="check-item${checked ? " is-checked" : ""}">
            <input type="checkbox" data-check-index="${index}" ${checked ? "checked" : ""} />
            <span>${escapeHTML(item)}</span>
          </label>
        `;
      })
      .join("");

    $("#bag-list").innerHTML = data.commute.bag
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join("");
    $("#rain-list").innerHTML = data.commute.rain
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join("");
    $("#warning-text").textContent = data.commute.warning;

    $("#daily-check-list").addEventListener("change", (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      checkbox.closest(".check-item").classList.toggle("is-checked", checkbox.checked);
      const checkedIndexes = $$('#daily-check-list input[type="checkbox"]:checked').map((input) =>
        Number(input.dataset.checkIndex),
      );
      safeStorageSet("hz-daily-checks", JSON.stringify(checkedIndexes));
    });

    $("#reset-checks").addEventListener("click", () => {
      $$('#daily-check-list input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
        checkbox.closest(".check-item").classList.remove("is-checked");
      });
      safeStorageSet("hz-daily-checks", "[]");
    });
  }

  function renderDifferences() {
    $("#comparison-grid").innerHTML = data.northComparison
      .map(
        (item) => `
          <article class="comparison-card">
            <span class="comparison-label">${escapeHTML(item.label)}</span>
            <h3>${escapeHTML(item.title)}</h3>
            <p>${escapeHTML(item.text)}</p>
          </article>
        `,
      )
      .join("");
  }

  function renderSources() {
    $("#source-list").innerHTML = data.sources
      .map(
        (source) => `
          <article class="source-item">
            <span class="source-type">${escapeHTML(source.type)}</span>
            <div class="source-copy">
              <strong>${escapeHTML(source.name)}</strong>
              <p>${escapeHTML(source.use)}</p>
            </div>
            <a
              href="${escapeHTML(source.url)}"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="打开${escapeHTML(source.name)}"
              title="打开来源"
            >↗</a>
          </article>
        `,
      )
      .join("");
  }

  function readCachedWeather() {
    const cached = safeStorageGet("hz-weather-cache-v1");
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (!parsed.weatherByDate || !parsed.fetchedAt) return;
      state.weatherByDate = parsed.weatherByDate;
      state.weatherFetchedAt = parsed.fetchedAt;
      const today = data.dailyPlans[getInitialDayIndex()]?.date;
      const todayWeather = weatherForDate(today);
      if (todayWeather) {
        data.meta.weatherStatus = "cached";
        data.meta.weatherLabel = "已载入上次查询结果";
        data.meta.weatherNote = `上次成功刷新：${new Date(parsed.fetchedAt).toLocaleString("zh-CN", {
          hour12: false,
        })}。请复核是否仍为最新。`;
      }
    } catch {
      // Ignore corrupt local cache.
    }
  }

  async function fetchWeather() {
    const button = $("#refresh-weather");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    button.disabled = true;
    button.textContent = "正在尝试连接…";
    $("#weather-heading").textContent = "正在查询天气";
    $("#weather-note").textContent = "如果网络或接口不可用，页面会保留季节参考建议。";

    try {
      const response = await fetch(data.meta.providerUrl, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`接口返回 HTTP ${response.status}`);
      const json = await response.json();
      if (!json.daily?.time?.length) throw new Error("接口未返回逐日数据");

      const weatherByDate = {};
      json.daily.time.forEach((date, index) => {
        weatherByDate[date] = {
          code: json.daily.weather_code[index],
          max: json.daily.temperature_2m_max[index],
          min: json.daily.temperature_2m_min[index],
          feelsMax: json.daily.apparent_temperature_max[index],
          feelsMin: json.daily.apparent_temperature_min[index],
          precipitation: json.daily.precipitation_sum[index],
          precipProbability: json.daily.precipitation_probability_max[index],
          windMax: json.daily.wind_speed_10m_max[index],
          gustMax: json.daily.wind_gusts_10m_max[index],
          humidityMax: json.daily.relative_humidity_2m_max[index],
          humidityMin: json.daily.relative_humidity_2m_min[index],
        };
      });

      state.weatherByDate = weatherByDate;
      state.weatherFetchedAt = new Date().toISOString();
      safeStorageSet(
        "hz-weather-cache-v1",
        JSON.stringify({
          weatherByDate: state.weatherByDate,
          fetchedAt: state.weatherFetchedAt,
        }),
      );

      data.meta.weatherStatus = "updated";
      data.meta.weatherLabel = "天气已刷新，请核对官方来源";
      data.meta.weatherNote =
        "已获取公开接口的16天预报。它并非中国气象局官方预报，预测会变化；出行和预警请以官方发布为准。";
      renderWeatherSummary();
      renderSelectedDay(state.selectedDayIndex);
    } catch (error) {
      data.meta.weatherStatus = "unavailable";
      data.meta.weatherLabel = "天气数据尚未更新";
      data.meta.weatherNote =
        "本次刷新未成功，可能是网络、浏览器跨域限制或接口暂时不可用。未填入任何猜测数值，请打开官方预报后再决定雨具、外套和外出安排。";
      renderWeatherSummary();
      renderSelectedDay(state.selectedDayIndex);
      $("#api-note").textContent = `刷新失败：${error.message}。可稍后重试或直接查看中国天气网。`;
    } finally {
      window.clearTimeout(timeoutId);
      button.disabled = false;
      button.textContent = "再次尝试刷新";
    }
  }

  function renderWeatherSummary() {
    $("#weather-heading").textContent = data.meta.weatherLabel;
    $("#weather-note").textContent = data.meta.weatherNote;
    const today = data.dailyPlans[getInitialDayIndex()]?.date;
    renderWeatherMetrics(weatherForDate(today));
  }

  function bindWeatherButton() {
    $("#refresh-weather").addEventListener("click", fetchWeather);
  }

  function init() {
    loadEmbeddedForecast();
    readCachedWeather();
    renderOverview();
    renderDaySelector();
    bindDayControls();
    state.selectedDayIndex = getInitialDayIndex();
    renderSelectedDay(state.selectedDayIndex);
    renderWeatherSummary();
    renderWeeks();
    renderClothingTable();
    renderFood();
    renderSleep();
    renderHome();
    bindHomeTabs();
    renderCommute();
    renderDifferences();
    renderSources();
    bindWeatherButton();

    if (state.weatherFetchedAt) {
      $("#api-note").textContent = `上次刷新：${new Date(state.weatherFetchedAt).toLocaleString(
        "zh-CN",
        { hour12: false },
      )}。如已联网，可再次刷新。`;
    }
  }

  init();
})();
