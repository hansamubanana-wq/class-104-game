import { useState, useEffect, useRef } from 'react';
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

function App() {
  const [gameMode, setGameMode] = useState('reading');
  const [targetCount, setTargetCount] = useState(10); // 何人正解したら終わりか
  const [currentStudent, setCurrentStudent] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  // ランキング（配列で保持）
  const [ranking, setRanking] = useState(() => {
    const saved = localStorage.getItem('class104_ranking_v2'); // 保存キーを変更（旧データと分けるため）
    return saved ? JSON.parse(saved) : [];
  });

  const inputRef = useRef(null);

  // ゲーム開始：モードと人数を受け取る
  const startGame = (mode, count) => {
    playSound('dummy'); 
    
    setGameMode(mode);
    setTargetCount(count);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setIsGameStarted(true);
    setStartTime(Date.now());
    pickNextStudent([], count);
  };

  const pickNextStudent = (doneIds, countLimit) => {
    // 終了判定：指定人数に達したら終わり
    if (doneIds.length >= countLimit) {
      finishGame();
      return;
    }

    // まだ出題されていない生徒からランダムに選出
    const remainingStudents = students.filter(s => !doneIds.includes(s.id));
    
    // 万が一全員出尽くした場合（10人モードならここは通らない）
    if (remainingStudents.length === 0) {
      finishGame();
      return;
    }

    const randomIndex = Math.floor(Math.random() * remainingStudents.length);
    setCurrentStudent(remainingStudents[randomIndex]);
  };

  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);
    playSound('clear');

    const currentTime = (end - startTime) / 1000;
    
    // ランキング更新（人数も記録）
    const newRecord = {
      date: new Date().toLocaleDateString(),
      time: currentTime,
      mode: gameMode,
      count: targetCount
    };
    
    const newRanking = [...ranking, newRecord]
      .sort((a, b) => a.time - b.time) // タイム順
      .slice(0, 10); // 上位10件まで保存

    setRanking(newRanking);
    localStorage.setItem('class104_ranking_v2', JSON.stringify(newRanking));
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);

    if (!currentStudent) return;

    const targetRaw = gameMode === 'reading' ? currentStudent.reading : currentStudent.name;
    const cleanVal = val.replace(/\s+/g, '');
    const cleanTarget = targetRaw.replace(/\s+/g, '');

    if (cleanVal === cleanTarget) {
      playSound('correct');
      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      // 次の問題へ（targetCountを渡す必要があるが、stateは即時反映されないため引数で渡すか、startGameでセットしたstateを使う）
      // ここではpickNextStudentの引数ロジックを少し修正してstateのtargetCountを参照させる
      pickNextStudent(newCompletedIds, targetCount);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && endTime) {
      // エンターキーでリトライ（同じ設定で）
      startGame(gameMode, targetCount);
    }
  };

  const formatTime = (time) => time ? time.toFixed(2) : '-.--';

  const shareResult = (platform) => {
    const time = formatTime((endTime - startTime) / 1000);
    const modeStr = gameMode === 'reading' ? 'ひらがな' : '漢字';
    const text = `【104名前当て】${targetCount}人モード(${modeStr})を${time}秒でクリア！`;
    const url = window.location.href;
    
    if (platform === 'line') {
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text + '\n' + url)}`, '_blank');
    } else if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    }
  };

  return (
    <div className="container">
      <h1>104 名前当てタイムアタック</h1>
      
      {!isGameStarted && !endTime && (
        <div className="start-screen">
          <div className="section-group">
            <h3>⚡️ サクッと (10問)</h3>
            <div className="button-row">
              <button onClick={() => startGame('reading', 10)} className="btn-primary">ひらがな</button>
              <button onClick={() => startGame('name', 10)} className="btn-secondary">漢字</button>
            </div>
          </div>

          <div className="section-group">
            <h3>🔥 全員 (37問)</h3>
            <div className="button-row">
              <button onClick={() => startGame('reading', 37)} className="btn-primary">ひらがな</button>
              <button onClick={() => startGame('name', 37)} className="btn-secondary">漢字</button>
            </div>
          </div>

          {ranking.length > 0 && (
            <div className="ranking-box">
              <h3>🏆 履歴 (Top 10)</h3>
              <ul>
                {ranking.map((r, i) => (
                  <li key={i} className={i === 0 ? 'rank-1' : ''}>
                    <span className="rank-left">
                      <span className="rank-num">{i + 1}.</span>
                      <span className="rank-mode-tag">
                        {r.count}人/{r.mode === 'reading' ? 'ひ' : '漢'}
                      </span>
                    </span>
                    <span className="rank-time">{formatTime(r.time)}秒</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {isGameStarted && !endTime && currentStudent && (
        <div className="game-screen">
          <div className="header-info">
             <span className="progress">残り: {targetCount - completedIds.length} 人</span>
             <span className="mode-badge">
               {targetCount}人 / {gameMode === 'reading' ? 'ひらがな' : '漢字'}
             </span>
          </div>
          
          <div className="question-card">
            <h2 className="student-number">{currentStudent.id}番</h2>
          </div>

          <div className="input-area">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              placeholder={gameMode === 'reading' ? "ひらがな" : "漢字"}
              autoFocus
            />
          </div>
          <p className="hint">※入力すると自動判定</p>
        </div>
      )}

      {endTime && (
        <div className="result-screen" onKeyDown={handleKeyDown}>
          <h2>クリア！</h2>
          <p className="sub-title">{targetCount}人モード ({gameMode === 'reading' ? 'ひらがな' : '漢字'})</p>
          
          <div className="result-box">
            <p className="time-label">Time</p>
            <p className="time-display">{formatTime((endTime - startTime) / 1000)} 秒</p>
          </div>

          <div className="share-area">
            <div className="share-buttons">
              <button onClick={() => shareResult('line')} className="btn-line">LINEで送る</button>
              <button onClick={() => shareResult('x')} className="btn-x">Xでポスト</button>
            </div>
          </div>

          <div className="retry-buttons">
            <button onClick={() => startGame(gameMode, targetCount)} className="btn-primary">
              もう一度やる
            </button>
            <button onClick={() => {setIsGameStarted(false); setEndTime(null);}} className="btn-text">
              モード選択に戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;