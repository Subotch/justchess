import { describe, it, expect } from "vitest";
import {
  getCapturedPieces,
  getLegalMovesFrom,
  isLegalMove,
  applyMove,
  getTurnFromFen,
  getGameState,
  parsePgnPositions,
  getKingSquare,
  formatTime,
  formatTimePrecise,
} from "../chess-engine";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Позиция после 1.e4 e5 2.Nf3 Nc6 3.Bc4 (Italian game)
const ITALIAN_FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

// Позиция мат (Fool's mate — чёрные дают мат)
const FOOLS_MATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

describe("getCapturedPieces", () => {
  it("начальная позиция — нет захваченных фигур", () => {
    expect(getCapturedPieces(INITIAL_FEN, "white")).toEqual({});
    expect(getCapturedPieces(INITIAL_FEN, "black")).toEqual({});
  });

  it("при отсутствии пешки на доске — она в захваченных", () => {
    // Позиция без одной чёрной пешки (e5 убрана вручную — упрощённо)
    const fen = "rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const captured = getCapturedPieces(fen, "white");
    expect(captured["p"]).toBe(1);
  });
});

describe("getLegalMovesFrom", () => {
  it("пешка e2 в начале имеет 2 хода", () => {
    const moves = getLegalMovesFrom(INITIAL_FEN, "e2");
    expect(moves).toContain("e3");
    expect(moves).toContain("e4");
    expect(moves).toHaveLength(2);
  });

  it("конь b1 в начале имеет 2 хода", () => {
    const moves = getLegalMovesFrom(INITIAL_FEN, "b1");
    expect(moves).toContain("a3");
    expect(moves).toContain("c3");
    expect(moves).toHaveLength(2);
  });

  it("нет ходов с пустой клетки", () => {
    const moves = getLegalMovesFrom(INITIAL_FEN, "e4");
    expect(moves).toHaveLength(0);
  });
});

describe("isLegalMove", () => {
  it("e2-e4 — легальный ход в начале", () => {
    expect(isLegalMove(INITIAL_FEN, "e2", "e4")).toBe(true);
  });

  it("e2-e5 — нелегальный ход", () => {
    expect(isLegalMove(INITIAL_FEN, "e2", "e5")).toBe(false);
  });

  it("перемещение на собственную фигуру — нелегально", () => {
    expect(isLegalMove(INITIAL_FEN, "e1", "d1")).toBe(false);
  });
});

describe("applyMove", () => {
  it("возвращает новый FEN после хода", () => {
    const result = applyMove(INITIAL_FEN, "e2", "e4");
    expect(result).not.toBeNull();
    expect(result!.fen).toContain("e3"); // en passant square
    expect(result!.san).toBe("e4");
  });

  it("возвращает null при нелегальном ходе", () => {
    expect(applyMove(INITIAL_FEN, "e2", "e6")).toBeNull();
  });
});

describe("getTurnFromFen", () => {
  it("в начальной позиции ход белых", () => {
    expect(getTurnFromFen(INITIAL_FEN)).toBe("white");
  });

  it("после 1.e4 ход чёрных", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(getTurnFromFen(fen)).toBe("black");
  });
});

describe("getGameState", () => {
  it("начальная позиция — нет мата/пата/шаха", () => {
    const state = getGameState(INITIAL_FEN);
    expect(state.isCheck).toBe(false);
    expect(state.isCheckmate).toBe(false);
    expect(state.isStalemate).toBe(false);
    expect(state.isGameOver).toBe(false);
  });

  it("Fool's Mate — мат", () => {
    const state = getGameState(FOOLS_MATE_FEN);
    expect(state.isCheckmate).toBe(true);
    expect(state.isGameOver).toBe(true);
  });
});

describe("parsePgnPositions", () => {
  it("парсит PGN партии из 2 ходов", () => {
    const pgn = "1. e4 e5";
    const positions = parsePgnPositions(pgn);
    expect(positions).toHaveLength(2);
    expect(positions[0].san).toBe("e4");
    expect(positions[0].color).toBe("white");
    expect(positions[0].moveNumber).toBe(1);
    expect(positions[1].san).toBe("e5");
    expect(positions[1].color).toBe("black");
  });

  it("пустой PGN → пустой массив", () => {
    expect(parsePgnPositions("")).toHaveLength(0);
  });
});

describe("getKingSquare", () => {
  it("белый король в начале на e1", () => {
    expect(getKingSquare(INITIAL_FEN, "white")).toBe("e1");
  });

  it("чёрный король в начале на e8", () => {
    expect(getKingSquare(INITIAL_FEN, "black")).toBe("e8");
  });
});

describe("formatTime", () => {
  it("60000 мс → 1:00", () => {
    expect(formatTime(60_000)).toBe("1:00");
  });

  it("0 мс → 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("отрицательное → 0:00", () => {
    expect(formatTime(-1000)).toBe("0:00");
  });

  it("90500 мс → 1:30", () => {
    expect(formatTime(90_500)).toBe("1:30");
  });
});

describe("formatTimePrecise", () => {
  it(">= 10 сек — возвращает mm:ss", () => {
    expect(formatTimePrecise(15_000)).toBe("0:15");
  });

  it("< 10 сек — возвращает десятые доли", () => {
    expect(formatTimePrecise(5_500)).toBe("5.5");
  });
});
