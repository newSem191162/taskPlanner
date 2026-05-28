// Глобальное состояние
let tasks = [];
let db = null;
let currentFilter = 'all';
let currentSort = 'priority';
let searchQuery = '';
let categories = ['Работа', 'Учеба', 'Личное', 'Проекты', 'Здоровье'];
let darkTheme = true;
let showStats = true;
let currentMonth = new Date();
let selectedDate = null;

// Инициализация IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TaskPlannerDB', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('tasks')) {
                const store = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                store.createIndex('deadline', 'deadline');
                store.createIndex('priority', 'priority');
                store.createIndex('completed', 'completed');
            }
        };
    });
}

// Загрузка задач
async function loadTasks() {
    return new Promise((resolve, reject) => {
        if (!db) { resolve([]); return; }
        const tx = db.transaction(['tasks'], 'readonly');
        const store = tx.objectStore('tasks');
        const request = store.getAll();
        request.onsuccess = () => {
            tasks = request.result || [];
            resolve(tasks);
        };
        request.onerror = () => reject(request.error);
    });
}

// Сохранение задачи
async function saveTaskToDB(task) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        const toSave = { ...task };
        if (toSave.id === undefined) delete toSave.id;
        const request = store.put(toSave);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Удаление задачи
async function deleteTaskFromDB(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Демо-данные
const demoTasks = [
    { title: "Подготовить презентацию", description: "Для клиента", deadline: new Date(Date.now() + 3*86400000).toISOString().split('T')[0], priority: 9, complexity: 8, category: "Работа", subtasks: [{ title: "Собрать материалы", hours: 2, completed: false, order: 1 }, { title: "Сделать слайды", hours: 4, completed: false, order: 2 }], completed: false, createdAt: new Date().toISOString() },
    { title: "Написать отчет", deadline: new Date(Date.now() + 7*86400000).toISOString().split('T')[0], priority: 7, complexity: 6, category: "Работа", subtasks: [], completed: false, createdAt: new Date().toISOString() }
];

async function loadDemoData() {
    for (const task of demoTasks) await saveTaskToDB(task);
}

function generateSubtasks(title, hours) {
    return [
        { title: 'Подготовка', hours: hours * 0.3, completed: false, order: 1 },
        { title: 'Выполнение', hours: hours * 0.5, completed: false, order: 2 },
        { title: 'Проверка', hours: hours * 0.2, completed: false, order: 3 }
    ];
}

function getFilteredTasks() {
    let filtered = [...tasks];
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t => t.title.toLowerCase().includes(q));
    }
    if (currentFilter === 'active') filtered = filtered.filter(t => !t.completed);
    if (currentFilter === 'completed') filtered = filtered.filter(t => t.completed);
    if (currentFilter === 'overdue') {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter(t => !t.completed && t.deadline < today);
    }
    if (currentSort === 'priority') filtered.sort((a, b) => b.priority - a.priority);
    if (currentSort === 'deadline') filtered.sort((a, b) => a.deadline.localeCompare(b.deadline));
    return filtered;
}

function renderTasks() {
    const container = document.getElementById('taskList');
    const empty = document.getElementById('emptyState');
    const filtered = getFilteredTasks();
    if (filtered.length === 0) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    container.innerHTML = filtered.map(task => {
        const deadline = new Date(task.deadline);
        const today = new Date().toISOString().split('T')[0];
        const isOverdue = !task.completed && task.deadline < today;
        const subDone = task.subtasks?.filter(s => s.completed).length || 0;
        const subTotal = task.subtasks?.length || 0;
        const progress = subTotal > 0 ? (subDone / subTotal) * 100 : (task.completed ? 100 : 0);
        return `
            <div class="task-card" onclick="window.openTaskDetails(${task.id})">
                <div class="task-header">
                    <span class="task-title">${escapeHtml(task.title)}</span>
                    <span class="badge badge-priority">⭐ ${task.priority}/10</span>
                </div>
                <div class="task-meta">
                    <span class="badge ${isOverdue ? 'badge-overdue' : ''}">📅 ${deadline.toLocaleDateString('ru-RU')}</span>
                    <span>⏱️ ${task.complexity}ч</span>
                    ${subTotal > 0 ? `<span>✅ ${subDone}/${subTotal}</span>` : ''}
                </div>
                ${subTotal > 0 ? `<div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>` : ''}
            </div>
        `;
    }).join('');
    updateStats();
}

function updateStats() {
    const total = tasks.length;
    const active = tasks.filter(t => !t.completed).length;
    const completed = tasks.filter(t => t.completed).length;
    const today = new Date().toISOString().split('T')[0];
    const overdue = tasks.filter(t => !t.completed && t.deadline < today).length;
    document.getElementById('totalCount').innerText = total;
    document.getElementById('activeCount').innerText = active;
    document.getElementById('completedCount').innerText = completed;
    document.getElementById('overdueCount').innerText = overdue;
}

async function saveTask(event) {
    event.preventDefault();
    const id = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitle').value;
    if (!title) { showNotification('Введите название', 'error'); return; }
    const task = {
        title: title,
        description: document.getElementById('taskDescription').value,
        deadline: document.getElementById('taskDeadline').value,
        priority: parseInt(document.getElementById('taskPriority').value),
        complexity: parseFloat(document.getElementById('taskComplexity').value),
        resources: document.getElementById('taskResources').value,
        category: document.getElementById('taskCategory').value,
        subtasks: [],
        completed: false,
        createdAt: new Date().toISOString()
    };
    if (id) task.id = parseInt(id);
    if (document.getElementById('autoSubtasks').checked && !id) {
        task.subtasks = generateSubtasks(task.title, task.complexity);
    } else {
        const items = document.querySelectorAll('#subtasksList .subtask-item');
        items.forEach((item, idx) => {
            const inputs = item.querySelectorAll('input');
            if (inputs[0]?.value) {
                task.subtasks.push({
                    title: inputs[0].value,
                    hours: parseFloat(inputs[1]?.value) || 1,
                    completed: false,
                    order: idx + 1
                });
            }
        });
    }
    await saveTaskToDB(task);
    await loadTasks();
    closeTaskModal();
    renderTasks();
    if (document.getElementById('calendarSection').classList.contains('active')) renderCalendar();
    if (document.getElementById('analyticsSection').classList.contains('active')) renderAnalytics();
    showNotification(id ? 'Задача обновлена' : 'Задача создана', 'success');
}

function openTaskModal(taskId = null) {
    const modal = document.getElementById('taskModal');
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('subtasksContainer').style.display = 'none';
    document.getElementById('subtasksList').innerHTML = '';
    if (taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            document.getElementById('modalTitle').innerText = '✏️ Редактировать';
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskDeadline').value = task.deadline;
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskComplexity').value = task.complexity;
            document.getElementById('taskResources').value = task.resources || '';
            document.getElementById('taskCategory').value = task.category || '';
            document.getElementById('autoSubtasks').checked = false;
            document.getElementById('subtasksContainer').style.display = 'block';
            renderSubtasksList(task.subtasks || []);
        }
    } else {
        document.getElementById('modalTitle').innerText = '➕ Новая задача';
        document.getElementById('taskDeadline').value = new Date().toISOString().split('T')[0];
        document.getElementById('autoSubtasks').checked = true;
    }
    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
}

function cancelTaskModal() { closeTaskModal(); }

function renderSubtasksList(subtasks) {
    const container = document.getElementById('subtasksList');
    container.innerHTML = subtasks.map((sub, i) => `
        <div class="subtask-item" style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" class="form-input" value="${escapeHtml(sub.title)}" style="flex:1;">
            <input type="number" class="form-input" value="${sub.hours}" step="0.5" style="width:70px;">
            <button class="btn" onclick="this.parentElement.remove()">✕</button>
        </div>
    `).join('');
}

function addSubtask() {
    const container = document.getElementById('subtasksList');
    const div = document.createElement('div');
    div.className = 'subtask-item';
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.marginBottom = '8px';
    div.innerHTML = `<input type="text" class="form-input" placeholder="Название" style="flex:1;"><input type="number" class="form-input" value="1" step="0.5" style="width:70px;"><button class="btn" onclick="this.parentElement.remove()">✕</button>`;
    container.appendChild(div);
}

function openTaskDetails(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const modal = document.getElementById('detailsModal');
    const content = document.getElementById('detailsContent');
    const deadline = new Date(task.deadline);
    const isOverdue = !task.completed && task.deadline < new Date().toISOString().split('T')[0];
    document.getElementById('detailsTitle').innerText = escapeHtml(task.title);
    content.innerHTML = `
        <p>${escapeHtml(task.description || 'Нет описания')}</p>
        <div class="task-meta" style="margin:12px 0">
            <span class="badge ${isOverdue ? 'badge-overdue' : ''}">📅 ${deadline.toLocaleDateString('ru-RU')}</span>
            <span class="badge badge-priority">⭐ ${task.priority}/10</span>
            <span>⏱️ ${task.complexity}ч</span>
        </div>
        ${task.subtasks?.length ? `<div class="subtasks-section"><h4>📋 Подзадачи</h4>${task.subtasks.map((sub, idx) => `<div class="subtask-item"><input type="checkbox" ${sub.completed ? 'checked' : ''} onchange="window.toggleSubtask(${task.id}, ${idx})"><span style="flex:1">${escapeHtml(sub.title)}</span><span>${sub.hours}ч</span></div>`).join('')}</div>` : ''}
        <div style="display:flex; gap:8px; margin-top:16px;">
            <button class="btn btn-primary" onclick="window.openTaskModal(${task.id});window.closeDetailsModal()">✏️ Редактировать</button>
            <button class="btn" onclick="window.toggleTaskComplete(${task.id})">${task.completed ? '↩️ Вернуть' : '✅ Завершить'}</button>
            <button class="btn btn-danger" onclick="window.deleteTask(${task.id})">🗑️ Удалить</button>
            <button class="btn" onclick="window.closeDetailsModal()">Закрыть</button>
        </div>
    `;
    modal.classList.add('active');
}

function closeDetailsModal() { document.getElementById('detailsModal').classList.remove('active'); }

async function toggleSubtask(taskId, idx) {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.subtasks) return;
    task.subtasks[idx].completed = !task.subtasks[idx].completed;
    if (task.subtasks.every(s => s.completed) && !task.completed) {
        task.completed = true;
        showNotification('Все подзадачи выполнены!', 'success');
    }
    await saveTaskToDB(task);
    await loadTasks();
    renderTasks();
    openTaskDetails(taskId);
}

async function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.completed = !task.completed;
    if (task.subtasks) task.subtasks.forEach(s => s.completed = task.completed);
    await saveTaskToDB(task);
    await loadTasks();
    renderTasks();
    closeDetailsModal();
    showNotification(task.completed ? 'Задача завершена' : 'Задача возвращена', 'success');
}

async function deleteTask(taskId) {
    if (!confirm('Удалить задачу?')) return;
    await deleteTaskFromDB(taskId);
    await loadTasks();
    renderTasks();
    closeDetailsModal();
    if (document.getElementById('calendarSection').classList.contains('active')) renderCalendar();
    if (document.getElementById('analyticsSection').classList.contains('active')) renderAnalytics();
    showNotification('Задача удалена', 'success');
}

function distributeTasksByDays() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const schedule = {};
    tasks.filter(t => !t.completed).forEach(task => {
        const deadline = new Date(task.deadline);
        const daysLeft = Math.ceil((deadline - today) / 86400000);
        if (daysLeft <= 0) return;
        const hoursPerDay = task.complexity / daysLeft;
        for (let i = 0; i < daysLeft; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            const key = date.toISOString().split('T')[0];
            if (!schedule[key]) schedule[key] = [];
            schedule[key].push({ taskId: task.id, title: task.title, hours: hoursPerDay });
        }
    });
    return schedule;
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    document.getElementById('monthTitle').innerHTML = currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay() || 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const schedule = distributeTasksByDays();
    const today = new Date().toISOString().split('T')[0];
    
    let html = '<div class="calendar-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">';
    const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    weekdays.forEach(day => {
        html += `<div style="text-align: center; padding: 12px; font-weight: bold; color: var(--text-sec);">${day}</div>`;
    });
    
    for (let i = 1; i < startDay; i++) {
        html += `<div style="background: var(--bg-card); border-radius: 12px; padding: 12px; text-align: center; opacity: 0.3;"></div>`;
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasTasks = schedule[dateStr] && schedule[dateStr].length > 0;
        const isToday = dateStr === today;
        const dayTasks = schedule[dateStr] || [];
        const totalHours = dayTasks.reduce((sum, t) => sum + t.hours, 0);
        
        html += `
            <div onclick="window.selectDate('${dateStr}')" style="
                background: ${isToday ? 'var(--accent)' : 'var(--bg-card)'};
                color: ${isToday ? 'white' : 'var(--text)'};
                border-radius: 12px;
                padding: 12px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid ${hasTasks ? 'var(--accent)' : 'var(--border)'};
                position: relative;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <div style="font-weight: bold; font-size: 1.1rem;">${d}</div>
                ${hasTasks ? `<div style="font-size: 0.7rem; margin-top: 4px;">${totalHours.toFixed(1)}ч</div>` : ''}
                ${hasTasks ? `<div style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; background: ${isToday ? 'white' : 'var(--accent)'}; border-radius: 50%;"></div>` : ''}
            </div>
        `;
    }
    
    html += '</div>';
    document.getElementById('calendarGrid').innerHTML = html;
}

function selectDate(dateStr) {
    selectedDate = dateStr;
    const schedule = distributeTasksByDays();
    const tasksList = schedule[dateStr] || [];
    const container = document.getElementById('dayTasks');
    if (tasksList.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;">Нет задач</p>';
        return;
    }
    container.innerHTML = `<h3>${new Date(dateStr).toLocaleDateString('ru-RU')}</h3><div class="task-list">${tasksList.map(t => `<div class="task-card" onclick="window.openTaskDetails(${t.taskId})"><div class="task-header"><span class="task-title">${escapeHtml(t.title)}</span></div><div class="task-meta">⏱️ ${t.hours.toFixed(1)}ч</div></div>`).join('')}</div>`;
}

function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    renderCalendar();
}

function renderAnalytics() {
    const active = tasks.filter(t => !t.completed);
    const totalHours = active.reduce((s, t) => s + t.complexity, 0);
    const avgPriority = active.length ? (active.reduce((s, t) => s + t.priority, 0) / active.length).toFixed(1) : 0;
    const byCategory = {};
    active.forEach(t => { const cat = t.category || 'Без категории'; byCategory[cat] = (byCategory[cat] || 0) + 1; });
    const html = `
        <div class="stats" style="margin-bottom:20px;">
            <div class="stat"><div class="stat-value">${active.length}</div><div>Активных</div></div>
            <div class="stat"><div class="stat-value">${totalHours}</div><div>Всего часов</div></div>
            <div class="stat"><div class="stat-value">${avgPriority}</div><div>Ср. приоритет</div></div>
        </div>
        <div><h3>📂 По категориям</h3><div class="stats">${Object.entries(byCategory).map(([cat, cnt]) => `<div class="stat"><div class="stat-value">${cnt}</div><div>${cat}</div></div>`).join('')}</div></div>
    `;
    document.getElementById('analyticsContent').innerHTML = html;
}

function toggleStats() {
    showStats = !showStats;
    document.getElementById('statsGrid').style.display = showStats ? 'grid' : 'none';
    document.getElementById('statsToggleBtn').innerText = showStats ? '📊 Скрыть' : '📊 Показать';
}

function toggleTheme() {
    darkTheme = !darkTheme;
    document.body.classList.toggle('light', !darkTheme);
}

function setFilter(filter, e) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (e?.target) e.target.classList.add('active');
    renderTasks();
}

function setSort(sort, e) {
    currentSort = sort;
    renderTasks();
}

function handleSearch(e) {
    searchQuery = e.target.value;
    renderTasks();
}

function exportData() {
    const data = JSON.stringify({ tasks, categories, exportDate: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Экспорт выполнен', 'success');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.tasks) {
            for (const t of tasks) await deleteTaskFromDB(t.id);
            for (const t of data.tasks) { delete t.id; await saveTaskToDB(t); }
            await loadTasks();
            renderTasks();
            showNotification('Импорт выполнен', 'success');
        }
    };
    input.click();
}

function showNotification(msg, type) {
    const n = document.getElementById('notification');
    n.innerText = msg;
    n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 2500);
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }

// Регистрация глобальных функций
window.saveTask = saveTask;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.cancelTaskModal = cancelTaskModal;
window.addSubtask = addSubtask;
window.toggleTheme = toggleTheme;
window.toggleStats = toggleStats;
window.exportData = exportData;
window.importData = importData;
window.setFilter = setFilter;
window.setSort = setSort;
window.handleSearch = handleSearch;
window.switchTab = (tab) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Section`).classList.add('active');
    if (tab === 'calendar') renderCalendar();
    if (tab === 'analytics') renderAnalytics();
};
window.changeMonth = changeMonth;
window.selectDate = selectDate;
window.openTaskDetails = openTaskDetails;
window.closeDetailsModal = closeDetailsModal;
window.deleteTask = deleteTask;
window.toggleSubtask = toggleSubtask;
window.toggleTaskComplete = toggleTaskComplete;

// Запуск
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    await loadTasks();
    if (tasks.length === 0) await loadDemoData();
    renderTasks();
    // Обработчики
    document.getElementById('themeBtn').onclick = toggleTheme;
    document.getElementById('statsToggleBtn').onclick = toggleStats;
    document.getElementById('newTaskBtn').onclick = () => openTaskModal();
    document.getElementById('closeModalBtn').onclick = closeTaskModal;
    document.getElementById('cancelModalBtn').onclick = cancelTaskModal;
    document.getElementById('addSubtaskBtn').onclick = addSubtask;
    document.getElementById('closeDetailsBtn').onclick = closeDetailsModal;
    document.getElementById('prevMonth').onclick = () => changeMonth(-1);
    document.getElementById('nextMonth').onclick = () => changeMonth(1);
    document.getElementById('searchInput').oninput = handleSearch;
    document.getElementById('taskForm').onsubmit = saveTask;
    document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => window.switchTab(tab.getAttribute('data-tab')));
    document.querySelectorAll('.filter-btn').forEach(btn => btn.onclick = (e) => setFilter(btn.getAttribute('data-filter'), e));
    document.getElementById('autoSubtasks').onchange = function() {
        document.getElementById('subtasksContainer').style.display = this.checked ? 'none' : 'block';
    };
    if (Notification.permission === 'default') Notification.requestPermission();
});