import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

function App() {
  // 画面管理: 'start', 'game', 'result', 'roster', 'practice'
  const [screen, setScreen] = useState('start');
  
  // ゲーム設定
  const [gameMode, setGameMode] = useState('reading'); // 'reading' or 'name'
  const [targetCount, setTargetCount] = useState(10);
  const [isRandomOrder, setIsRandomOrder] = useState(true); // ランダムか順番か
  const [isPractice, setIsPractice] = useState(false); // 練習モードかどうか
  
  // ゲームプレイ用ステート
  const [questionList, setQuestionList] = useState([]); // 出題する生徒リスト
  const [currentStudent, setCurrentStudent] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isShake, setIsShake] = useState(false);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState("0.00");

  // ランキング用ステート
  const [ranking, setRanking] = useState(() => {
    const saved = localStorage.getItem('class104_ranking_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [rankingTab, setRankingTab] = useState('10-reading'); // ランキングの表示切り替え

  // 練習モード用ステート
  const [practiceRange, setPracticeRange] = useState({ start: 1, end: 37 });
  const [practiceSelectIds, setPracticeSelectIds] = useState([]);
  const [practiceType, setPracticeType] = useState('range'); // 'range' or 'select'

  const inputRef = useRef(null);

  // タイマー
  useEffect(() => {
    let interval;
    if (screen === 'game' && startTime && !endTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const diff = (now - startTime) / 1000;
        setCurrentTimeDisplay(diff.toFixed(2));
      }, 50);
    }
    return () => clearInterval(interval);
  }, [screen, startTime, endTime]);

  // --- ゲーム開始処理 ---
  
  // 通常モード開始
  const startNormalGame = (mode, count) => {
    playSound('dummy');
    setGameMode(mode);
    setTargetCount(count);
    setIsRandomOrder(true);
    setIsPractice(false);
    
    // 全員対象
    setupGame(students, mode, true);
  };

  // 練習モード開始
  const startPracticeGame = () => {
    playSound('dummy');
    setIsPractice(true);
    
    let targets = [];
    if (practiceType === 'range') {
      targets = students.filter(s => s.id >= practiceRange.start && s.id <= practiceRange.end);
    } else {
      targets = students.filter(s => practiceSelectIds.includes(s.id));
    }

    if (targets.length === 0) {
      alert("対象の生徒がいません！");
      return;
    }

    setTargetCount(targets.length);
    // モードは練習設定画面で選ばれたものを使う（ここでは仮でひらがな、あとでボタンで分岐可能にするが、今回はひらがな/漢字ボタンで開始させる）
    // ※UI側で startPracticeGame を呼ぶときにモードを渡す形にする
  };

  // 共通セットアップ
  const setupGame = (targetStudents, mode, random) => {
    setGameMode(mode);
    setIsRandomOrder(random);
    
    // 出題リストを作成（ランダムならシャッフル、順番ならID順）
    let list = [...targetStudents];
    if (random) {
      list.sort(() => Math.random() - 0.5);
    } else {
      list.sort((a, b) => a.id - b.id);
    }

    setQuestionList(list);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setCurrentTimeDisplay("0.00");
    setScreen('game');
    setStartTime(Date.now());
    
    // 最初の問題
    setCurrentStudent(list[0]);
  };

  // 次の問題へ
  const nextQuestion = (newCompletedIds) => {
    if (newCompletedIds.length >= questionList.length) {
      finishGame();
      return;
    }
    // 次の生徒を取り出す
    const nextIndex = newCompletedIds.length;
    setCurrentStudent(questionList[nextIndex]);
  };

  // ゲーム終了
  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);
    setScreen('result');
    playSound('clear');
    triggerConfetti();

    const currentTime = (end - startTime) / 1000;
    setCurrentTimeDisplay(currentTime.toFixed(2));

    // 練習モードでなければランキング保存
    if (!isPractice) {
      const newRecord = {
        date: new Date().toLocaleDateString(),
        time: currentTime,
        mode: gameMode,
        count: targetCount
      };
      const newRanking = [...ranking, newRecord].sort((a, b) => a.time - b.time); 
      // 全保存しておいて表示時にフィルタリング＆上位表示する
      setRanking(newRanking);
      localStorage.setItem('class104_ranking_v2', JSON.stringify(newRanking));
    }
  };

  // 入力判定
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    setIsShake(false);

    if (!currentStudent) return;

    const targetRaw = gameMode === 'reading' ? currentStudent.reading : currentStudent.name;
    const cleanVal = val.replace(/\s+/g, '');
    const cleanTarget = targetRaw.replace(/\s+/g, '');

    if (cleanVal === cleanTarget) {
      playSound('correct');
      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      nextQuestion(newCompletedIds);
    } else {
      if (!cleanTarget.startsWith(cleanVal) && cleanVal.length > 0) {
        setIsShake(true);
      }
    }
  };

  // 紙吹雪
  const triggerConfetti = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  // シェア
  const shareResult = (platform) => {
    const time = currentTimeDisplay;
    const modeStr = gameMode === 'reading' ? 'ひらがな' : '漢字';
    const typeStr = isPractice ? '練習' : `${targetCount}人モード`;
    const text = `【104名前当て】${typeStr}(${modeStr})を${time}秒でクリア！`;
    const url = window.location.href;
    if (platform === 'line') window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text + '\n' + url)}`, '_blank');
    if (platform === 'x') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  // ランキングフィルタリング表示用
  const getFilteredRanking = () => {
    const [rCount, rMode] = rankingTab.split('-');
    const countNum = parseInt(rCount);
    return ranking
      .filter(r => r.count === countNum && r.mode === rMode)
      .slice(0, 5); // 上位5件
  };

  // --- 描画 ---
  return (
    <div className="container">
      {/* スタート画面 */}
      {screen === 'start' && (
        <div className="start-screen fade-in">
          <h1>104 名前当て</h1>
          
          <div className="menu-buttons">
            <div className="section-group">
              <h3>⚡️ サクッと (10問)</h3>
              <div className="button-row">
                <button onClick={() => startNormalGame('reading', 10)} className="btn-primary">ひらがな</button>
                <button onClick={() => startNormalGame('name', 10)} className="btn-secondary">漢字</button>
              </div>
            </div>

            <div className="section-group">
              <h3>🔥 全員 (37問)</h3>
              <div className="button-row">
                <button onClick={() => startNormalGame('reading', 37)} className="btn-primary">ひらがな</button>
                <button onClick={() => startNormalGame('name', 37)} className="btn-secondary">漢字</button>
              </div>
            </div>

            <div className="sub-menu-row">
              <button onClick={() => setScreen('practice')} className="btn-outline">🔰 練習・カスタム</button>
              <button onClick={() => setScreen('roster')} className="btn-outline">📖 名簿を見る</button>
            </div>
          </div>

          {/* ランキング表示 */}
          <div className="ranking-area">
            <div className="ranking-tabs">
              <button className={rankingTab === '10-reading' ? 'active' : ''} onClick={()=>setRankingTab('10-reading')}>10ひ</button>
              <button className={rankingTab === '10-name' ? 'active' : ''} onClick={()=>setRankingTab('10-name')}>10漢</button>
              <button className={rankingTab === '37-reading' ? 'active' : ''} onClick={()=>setRankingTab('37-reading')}>全ひ</button>
              <button className={rankingTab === '37-name' ? 'active' : ''} onClick={()=>setRankingTab('37-name')}>全漢</button>
            </div>
            <ul className="ranking-list">
              {getFilteredRanking().length === 0 && <li className="no-data">記録なし</li>}
              {getFilteredRanking().map((r, i) => (
                <li key={i} className={i === 0 ? 'rank-1' : ''}>
                  <span className="rank-num">{i + 1}</span>
                  <span className="rank-time">{r.time.toFixed(2)}s</span>
                  <span className="rank-date">{r.date.slice(5)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 名簿画面 */}
      {screen === 'roster' && (
        <div className="roster-screen fade-in">
          <h2>1年104組 名簿</h2>
          <div className="roster-list">
            {students.map(s => (
              <div key={s.id} className="roster-item">
                <span className="roster-id">{s.id}</span>
                <div className="roster-info">
                  <span className="roster-name">{s.name}</span>
                  <span className="roster-reading">{s.reading}</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setScreen('start')} className="btn-text">戻る</button>
        </div>
      )}

      {/* 練習設定画面 */}
      {screen === 'practice' && (
        <div className="practice-screen fade-in">
          <h2>練習モード設定</h2>
          
          <div className="practice-option">
            <label>出題順:</label>
            <div className="toggle-row">
              <button className={!isRandomOrder ? 'active' : ''} onClick={()=>setIsRandomOrder(false)}>番号順</button>
              <button className={isRandomOrder ? 'active' : ''} onClick={()=>setIsRandomOrder(true)}>ランダム</button>
            </div>
          </div>

          <div className="practice-option">
            <label>範囲:</label>
            <div className="toggle-row">
              <button className={practiceType === 'range' ? 'active' : ''} onClick={()=>setPracticeType('range')}>番号指定</button>
              <button className={practiceType === 'select' ? 'active' : ''} onClick={()=>setPracticeType('select')}>個別選択</button>
            </div>
          </div>

          {practiceType === 'range' && (
            <div className="range-inputs">
              <input type="number" value={practiceRange.start} onChange={(e)=>setPracticeRange({...practiceRange, start: Number(e.target.value)})} />
              <span>〜</span>
              <input type="number" value={practiceRange.end} onChange={(e)=>setPracticeRange({...practiceRange, end: Number(e.target.value)})} />
            </div>
          )}

          {practiceType === 'select' && (
            <div className="select-list">
              {students.map(s => (
                <label key={s.id} className="checkbox-item">
                  <input 
                    type="checkbox" 
                    checked={practiceSelectIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) setPracticeSelectIds([...practiceSelectIds, s.id]);
                      else setPracticeSelectIds(practiceSelectIds.filter(id => id !== s.id));
                    }}
                  />
                  {s.id}. {s.name}
                </label>
              ))}
            </div>
          )}

          <div className="button-row" style={{marginTop: '1rem'}}>
            <button onClick={() => {
              let targets = practiceType === 'range' 
                ? students.filter(s => s.id >= practiceRange.start && s.id <= practiceRange.end)
                : students.filter(s => practiceSelectIds.includes(s.id));
              if(targets.length === 0) return alert("生徒を選んでください");
              setupGame(targets, 'reading', isRandomOrder);
            }} className="btn-primary">ひらがなで開始</button>
            
            <button onClick={() => {
              let targets = practiceType === 'range' 
                ? students.filter(s => s.id >= practiceRange.start && s.id <= practiceRange.end)
                : students.filter(s => practiceSelectIds.includes(s.id));
              if(targets.length === 0) return alert("生徒を選んでください");
              setupGame(targets, 'name', isRandomOrder);
            }} className="btn-secondary">漢字で開始</button>
          </div>
          <button onClick={() => setScreen('start')} className="btn-text">戻る</button>
        </div>
      )}

      {/* ゲーム画面 */}
      {screen === 'game' && currentStudent && (
        <div className="game-screen fade-in">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${(completedIds.length / questionList.length) * 100}%` }}></div>
          </div>
          
          <div className="header-info">
             <span className="progress">残り: {questionList.length - completedIds.length} 人</span>
             <span className="timer-badge">⏱ {currentTimeDisplay}s</span>
          </div>
          
          <div className="question-card">
            <h2 className="student-number">{currentStudent.id}番</h2>
          </div>

          <div className={`input-area ${isShake ? 'shake' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              placeholder={gameMode === 'reading' ? "ひらがな" : "漢字"}
              autoFocus
              className={isShake ? 'input-error' : ''}
            />
          </div>
          {isPractice && !isRandomOrder && <p className="hint">次は {currentStudent.id + 1}番です</p>}
        </div>
      )}

      {/* 結果画面 */}
      {screen === 'result' && (
        <div className="result-screen fade-in">
          <h2>🎉 CLEAR! 🎉</h2>
          <p className="sub-title">{isPractice ? '練習モード' : `${targetCount}人モード`} ({gameMode === 'reading' ? 'ひらがな' : '漢字'})</p>
          
          <div className="result-box">
            <p className="time-label">Time</p>
            <p className="time-display">{currentTimeDisplay} 秒</p>
          </div>

          <div className="share-area">
            <div className="share-buttons">
              <button onClick={() => shareResult('line')} className="btn-line">LINE</button>
              <button onClick={() => shareResult('x')} className="btn-x">X</button>
            </div>
          </div>

          <div className="retry-buttons">
            <button onClick={() => setScreen('start')} className="btn-primary">トップに戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;