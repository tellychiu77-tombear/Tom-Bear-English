import { useState } from "react";

const STUDENTS = [
  { id: 1, name: "王小明", english: "Tommy", filled: true, unread: 2 },
  { id: 2, name: "陳美華", english: "Amy", filled: true, unread: 0 },
  { id: 3, name: "林大偉", english: "David", filled: false, unread: 1 },
  { id: 4, name: "張雅婷", english: "Tina", filled: false, unread: 0 },
  { id: 5, name: "黃俊傑", english: "Jason", filled: false, unread: 3 },
  { id: 6, name: "劉思穎", english: "Cindy", filled: true, unread: 0 },
  { id: 7, name: "吳建宏", english: "Kevin", filled: false, unread: 0 },
  { id: 8, name: "蔡雨軒", english: "Rain", filled: false, unread: 1 },
];

const CHATS = [
  { id: 1, student: "王小明", parent: "王媽媽", avatar: "王", unread: 2, last: "請問今天有補充作業嗎？", time: "17:42", messages: [
    { from: "parent", text: "老師好！小明今天心情怎麼樣？", time: "17:30" },
    { from: "parent", text: "請問今天有補充作業嗎？", time: "17:42" },
  ]},
  { id: 3, student: "林大偉", parent: "林爸爸", avatar: "林", unread: 1, last: "大偉今天幾點下課？", time: "17:15", messages: [
    { from: "parent", text: "大偉今天幾點下課？", time: "17:15" },
  ]},
  { id: 5, student: "黃俊傑", parent: "黃媽媽", avatar: "黃", unread: 3, last: "老師我們下週要請假", time: "16:58", messages: [
    { from: "parent", text: "老師好，想跟您說", time: "16:50" },
    { from: "parent", text: "我們下週三要帶Jason去看牙醫", time: "16:55" },
    { from: "parent", text: "老師我們下週要請假", time: "16:58" },
  ]},
  { id: 8, student: "蔡雨軒", parent: "蔡媽媽", avatar: "蔡", unread: 1, last: "謝謝老師的聯絡簿！", time: "16:30", messages: [
    { from: "teacher", text: "Rain 今天表現很棒！", time: "16:25" },
    { from: "parent", text: "謝謝老師的聯絡簿！", time: "16:30" },
  ]},
];

function Stars({ value, onChange, color = "text-yellow-400" }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange?.(n)}
          className={`text-lg leading-none transition-transform ${n <= value ? color : "text-gray-200"} ${onChange ? "hover:scale-125 cursor-pointer" : "cursor-default"}`}>★</button>
      ))}
    </div>
  );
}

export default function App() {
  const [selectedId, setSelectedId] = useState(3);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [students, setStudents] = useState(STUDENTS);
  const [formData, setFormData] = useState({});
  const [replyText, setReplyText] = useState("");
  const [chats, setChats] = useState(CHATS);

  // 統發
  const [broadcastTopic, setBroadcastTopic] = useState("");
  const [broadcastHomework, setBroadcastHomework] = useState("");
  const [broadcastSent, setBroadcastSent] = useState(false);

  function handleBroadcast() {
    if (!broadcastTopic && !broadcastHomework) return;
    setFormData(f => {
      const next = { ...f };
      students.forEach(s => {
        next[s.id] = { ...(next[s.id] || { mood:0, focus:0, participation:0, expression:0, public_note:"", teacher_note:"" }), lesson_topic: broadcastTopic, homework: broadcastHomework };
      });
      return next;
    });
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 2000);
  }

  const selected = students.find(s => s.id === selectedId);
  const filledCount = students.filter(s => s.filled).length;
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);
  const selectedChat = chats.find(c => c.id === selectedChatId);
  const currentForm = formData[selectedId] || { mood: 0, focus: 0, participation: 0, expression: 0, lesson_topic: "", homework: "", public_note: "", teacher_note: "" };

  function updateForm(key, val) {
    setFormData(f => ({ ...f, [selectedId]: { ...currentForm, [key]: val } }));
  }

  function saveRecord() {
    setStudents(s => s.map(st => st.id === selectedId ? { ...st, filled: true } : st));
    const unfilled = students.filter(s => !s.filled && s.id !== selectedId);
    if (unfilled.length > 0) setSelectedId(unfilled[0].id);
  }

  function sendReply() {
    if (!replyText.trim() || !selectedChatId) return;
    setChats(cs => cs.map(c => c.id === selectedChatId
      ? { ...c, messages: [...c.messages, { from: "teacher", text: replyText, time: "現在" }], unread: 0, last: replyText }
      : c));
    setReplyText("");
  }

  function openChat(id) {
    setSelectedChatId(id);
    setChats(cs => cs.map(c => c.id === id ? { ...c, unread: 0 } : c));
  }

  return (
    <div className="flex bg-gray-100 overflow-hidden" style={{ height: "100vh" }}>

      {/* 左側學生名單 */}
      <div className="bg-white border-r border-gray-100 flex flex-col flex-shrink-0" style={{ width: 200 }}>
        <div className="p-3 border-b border-gray-50">
          <p className="text-sm font-black text-gray-800 mb-2">📒 聯絡簿</p>
          <select className="w-full p-1.5 text-xs font-bold border rounded-lg bg-indigo-50 text-indigo-700 outline-none">
            <option>CEI-A 班</option><option>CEI-B 班</option><option>CEI-C 班</option>
          </select>
        </div>
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
            <span>今日進度</span>
            <span className={filledCount === students.length ? "text-green-500" : "text-indigo-500"}>{filledCount}/{students.length}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(filledCount/students.length)*100}%` }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {students.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition border-l-2 ${selectedId === s.id ? "bg-indigo-50 border-indigo-500" : "border-transparent hover:bg-gray-50"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${s.filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {s.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-bold truncate ${selectedId === s.id ? "text-indigo-700" : "text-gray-700"}`}>{s.name}</span>
                  {s.filled && <span className="text-green-400 text-xs">✓</span>}
                </div>
                <span className="text-xs text-gray-400">{s.english}</span>
              </div>
              {s.unread > 0 && (
                <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{s.unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 中間填寫區 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">{selected?.name[0]}</div>
            <div>
              <span className="font-black text-gray-800">{selected?.name}</span>
              <span className="text-gray-400 text-xs ml-1.5">{selected?.english} · 國小三年級</span>
            </div>
            {selected?.filled && <span className="bg-green-100 text-green-600 text-xs font-bold px-2 py-0.5 rounded-full">✓ 已填</span>}
          </div>
          <span className="text-xs text-gray-400 font-bold">📅 2026/04/17</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* 統發區塊 */}
          <div className="bg-violet-50 rounded-xl p-3.5 border border-violet-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-violet-600">📡 統發全班內容</label>
              <span className="text-[10px] text-violet-400 font-bold">填完按統發 → 自動套用給所有學生</span>
            </div>
            <div className="space-y-2">
              <input value={broadcastTopic} onChange={e => setBroadcastTopic(e.target.value)}
                placeholder="今日主題（例：Unit 5 - Animals）"
                className="w-full p-2 border border-violet-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-200" />
              <input value={broadcastHomework} onChange={e => setBroadcastHomework(e.target.value)}
                placeholder="複習功課（例：p.32 聽讀三次、單字抄寫）"
                className="w-full p-2 border border-violet-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
            <button onClick={handleBroadcast}
              className={`mt-2.5 w-full py-2 text-sm font-black rounded-lg transition ${broadcastSent ? "bg-green-500 text-white" : "bg-violet-600 text-white hover:bg-violet-700"}`}>
              {broadcastSent ? "✅ 已套用給全班！" : "📡 統發給全班"}
            </button>
          </div>

          {/* 個別主題（可覆蓋統發值） */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <label className="text-xs font-black text-indigo-500 block mb-2">📖 今日主題</label>
              <input value={currentForm.lesson_topic} onChange={e => updateForm("lesson_topic", e.target.value)}
                placeholder="可個別修改..."
                className="w-full p-2 border border-indigo-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <label className="text-xs font-black text-blue-500 block mb-2">📝 複習功課</label>
              <input value={currentForm.homework} onChange={e => updateForm("homework", e.target.value)}
                placeholder="可個別修改..."
                className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
            <label className="text-xs font-black text-gray-400 block mb-3">⭐ 課堂表現</label>
            <div className="grid grid-cols-2 gap-3">
              {[["mood","😊 心情","text-yellow-400"],["focus","🎯 專注度","text-indigo-400"],["participation","🙋 互動","text-emerald-400"],["expression","💬 主動表達","text-purple-400"]].map(([key,label,color]) => (
                <div key={key}>
                  <p className="text-xs text-gray-500 mb-1 font-bold">{label}</p>
                  <Stars value={currentForm[key]} onChange={v => updateForm(key, v)} color={color} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3 border border-green-100">
              <label className="text-xs font-black text-green-600 block mb-1.5">📤 給家長</label>
              <textarea rows={3} value={currentForm.public_note} onChange={e => updateForm("public_note", e.target.value)}
                placeholder="家長可看到..." className="w-full text-sm p-2 border border-green-200 rounded-lg bg-white resize-none outline-none" />
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <label className="text-xs font-black text-gray-400 block mb-1.5">🔒 內部備注</label>
              <textarea rows={3} value={currentForm.teacher_note} onChange={e => updateForm("teacher_note", e.target.value)}
                placeholder="僅老師可見..." className="w-full text-sm p-2 border border-gray-200 rounded-lg bg-white resize-none outline-none" />
            </div>
          </div>

          <div className="flex gap-2 pb-2">
            <button className="px-4 py-2 text-sm font-bold text-gray-400 bg-white border rounded-xl hover:bg-gray-50 transition">略過</button>
            <button onClick={saveRecord} className="flex-1 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md transition">
              💾 儲存並跳下一位
            </button>
          </div>
        </div>
      </div>

      {/* 右側聊天欄 */}
      <div className="transition-all duration-300 bg-white border-l border-gray-100 flex flex-col overflow-hidden flex-shrink-0" style={{ width: chatOpen ? 260 : 0 }}>
        {chatOpen && (
          <>
            <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
              <span className="font-black text-gray-800 text-sm">💬 親師對話</span>
              <button onClick={() => { setChatOpen(false); setSelectedChatId(null); }}
                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xs text-gray-500 font-bold">✕</button>
            </div>
            {!selectedChatId ? (
              <div className="flex-1 overflow-y-auto">
                {chats.map(c => (
                  <button key={c.id} onClick={() => openChat(c.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-gray-50 border-b border-gray-50 transition">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm flex-shrink-0">{c.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <span className="text-sm font-bold text-gray-800">{c.parent}</span>
                        <span className="text-[10px] text-gray-400">{c.time}</span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{c.last}</p>
                    </div>
                    {c.unread > 0 && <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{c.unread}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setSelectedChatId(null)} className="text-gray-400 text-sm font-bold hover:text-gray-600">←</button>
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">{selectedChat?.avatar}</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">{selectedChat?.parent}</p>
                    <p className="text-[10px] text-gray-400">關於 {selectedChat?.student}</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {selectedChat?.messages.map((m, i) => (
                    <div key={i} className={`flex ${m.from === "teacher" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs font-medium ${m.from === "teacher" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-700 rounded-bl-sm"}`}>
                        {m.text}
                        <span className={`block text-[9px] mt-0.5 ${m.from === "teacher" ? "text-indigo-200" : "text-gray-400"}`}>{m.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-2.5 border-t border-gray-100 flex gap-2 flex-shrink-0">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendReply()}
                    placeholder="回覆..." className="flex-1 px-3 py-1.5 text-xs border rounded-full outline-none focus:ring-2 focus:ring-indigo-200" />
                  <button onClick={sendReply} className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-indigo-700">↑</button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 浮動聊天按鈕 */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center text-xl hover:bg-indigo-700 transition hover:scale-110 z-50">
          💬
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">{totalUnread}</span>
          )}
        </button>
      )}
    </div>
  );
}
