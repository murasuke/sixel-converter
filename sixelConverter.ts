/**
 * @file sixelConverter.ts
 *
 * 画像を読み込み、ターミナルへ(Sixelグラフィックスを用いて)表示します
 *
 * - 指定した画像ファイルを読み込み、node-canvas を使って画像のピクセルデータを取得
 * - 各ピクセルの色を減色(Webセーフカラー216色)
 * - Sixelグラフィックス(エスケープシーケンス)文字列に変換
 *
 * 使用方法:
 *   npx tsx sixelConverter.ts <image-file> [-d]
 *
 * 依存モジュール: node-canvas
 *
 * 注意事項: Windows Terminal環境では「node.exe」とのように拡張子をつけて実行する必要があります
 */

import { loadImage, createCanvas, Image } from 'canvas';

/**
 * メイン処理:
 * コマンドライン引数から画像ファイルのパスを取得し、
 * 画像の読み込み、減色、Sixel変換を順次実行します。
 */
async function main(): Promise<void> {
  const filename: string | undefined = process.argv[2];
  if (!filename) {
    console.error('Usage: npx tsx sixelConverter.ts <image-file>');
    process.exit(1);
  }

  try {
    // 画像読み込みとピクセルデータ取得
    const { data, img } = await imageLoader(filename);
    // 減色処理: 各ピクセルの色を減色して、パレット番号に変換する
    const { colorData, colorMap } = reductionColor(data, img.width, img.height);
    // Sixelグラフィックス(エスケープシーケンス)文字列に変換
    const sixel = convertToSixel(colorData, colorMap, img.width, img.height);
    // コンソールに表示
    console.log(sixel);

    // デバッグ用: エスケープシーケンスを可視化する場合は下記を使用
    if (process.argv[3] === '-d') {
      console.log(colorData);
      console.log(colorMap);
      console.log(sixel.replaceAll('\x1B', '\\x1B'));
    }
  } catch (error) {
    console.error('Error processing image:', error);
  }
}

/**
 * 画像ファイルを読み込み、Canvas に描画してピクセルデータを取得する非同期関数
 * @param filename - 読み込む画像ファイルのパス
 * @returns 画像のRGBAデータ（Uint8ClampedArray）と読み込んだImageオブジェクト
 */
async function imageLoader(
  filename: string
): Promise<{ data: Uint8ClampedArray; img: Image }> {
  let img: Image;
  try {
    img = await loadImage(filename);
  } catch (e) {
    console.error(`Cannot load image "${filename}"`);
    process.exit(1);
  }

  // 画像と同じサイズのCanvasを作成し、画像を描画する
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Canvasからピクセルデータを取得
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  return { data, img };
}
/**
 * 画像のRGBAデータを元に、色の減色を行う関数
 * 各色成分を quantize の倍数に丸め、透明ピクセルは白(0xFFFFFF)とする。
 * また、色に対してパレット番号を割り当てる。
 *
 * ※ ここでは、scaleFactor を用いて各色成分を縮小することで、
 *     元の画像に近い色合い（全体が明るすぎない状態）になるよう調整しています。
 *
 * @param data - RGBAデータ（Uint8ClampedArray）
 * @param width - 画像の横幅（ピクセル）
 * @param height - 画像の縦幅（ピクセル）
 * @returns 各ピクセルのパレット番号を保持する Uint32Array と、色からパレット番号へのマッピング
 */
function reductionColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { colorData: Uint32Array; colorMap: Map<number, number> } {
  // ピクセルデータの配列(左上からピクセル毎にパレット番号をセット)
  const colorData = new Uint32Array(width * height);
  // 色を一意に識別するための Map (RGB値 -> パレット番号)
  const colorMap = new Map<number, number>();
  const quantize = 51; // 0, 51, 102, ... ,255 の6段階に丸める（216色セーフカラー）
  const scaleFactor = 0.56; // 各色成分を見た目に近い形へ調整(明るさを抑える。値は目視で適当に調整)

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    let r = data[offset];
    let g = data[offset + 1];
    let b = data[offset + 2];
    const a = data[offset + 3];

    // 減色前に各色成分にスケールファクターを適用（高輝度部分が白に偏らないように調整）
    const scaledR = r * scaleFactor;
    const scaledG = g * scaleFactor;
    const scaledB = b * scaleFactor;

    // 各色成分を quantize の倍数に丸める（例: 0, 51, 102, 153, 204, 255）
    const qR = Math.floor(scaledR / quantize) * quantize;
    const qG = Math.floor(scaledG / quantize) * quantize;
    const qB = Math.floor(scaledB / quantize) * quantize;

    // 3色を1つの数値にまとめる（24bit RGB値として扱う）
    let qRGB = qR * 256 * 256 + qG * 256 + qB;
    if (a === 0) {
      // 透明ピクセルは白として扱う
      qRGB = 0xffffff;
    }

    // 存在しない色なら、新たなパレット番号を割り当てる
    if (!colorMap.has(qRGB)) {
      colorMap.set(qRGB, colorMap.size + 1);
    }

    // 現在のピクセルに対応するパレット番号を記録する
    colorData[i] = colorMap.get(qRGB) ?? 0;
  }

  return { colorData, colorMap };
}

/**
 * 減色済みの画像データを Sixel 形式の文字列に変換する関数
 *
 * Sixel形式では、エスケープシーケンスで開始・終了を示し、
 * 途中でパレット定義(#n;2;R;G;B)と、各ピクセルの色データを記述します。
 *
 * @param data - 各ピクセルのパレット番号を格納した Uint32Array
 * @param colorMap - 減色済みRGB値からパレット番号へのマッピング (Map<number, number>)
 * @param width - 画像の横幅（ピクセル）
 * @param height - 画像の縦幅（ピクセル）
 * @returns Sixelグラフィックスの文字列
 */
function convertToSixel(
  data: Uint32Array,
  colorMap: Map<number, number>,
  width: number,
  height: number
): string {
  const ESC = '\x1B';
  let output = ESC + 'Pq'; // Sixel開始シーケンス
  // 画像のプロパティ指定（アスペクト比1:1、解像度96dpi x 96dpi）
  output += `"1;1;96;96`;

  // カラーパレットの定義
  // Map.forEach のコールバックは (value, key) の順で渡される
  colorMap.forEach((paletteIndex: number, quantizedRGB: number) => {
    // quantizedRGB から各色成分を抽出
    const r = (quantizedRGB >> 16) & 0xff;
    const g = (quantizedRGB >> 8) & 0xff;
    const b = quantizedRGB & 0xff;
    output += `#${paletteIndex};2;${r};${g};${b}`;
  });

  // ここでは、各ピクセルのパレット番号と、6ピクセルブロックの
  // ビットパターンを表すキャラクタ（仮の例として行番号により決定）を出力する
  const chars: string[] = ['@', 'A', 'C', 'G', 'O', '_']; // 6段のビットパターンを表現する文字群

  let i = 0; // ピクセルデータのインデックス
  // 画像の各行を処理するループ
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 各ピクセルごとに、対応するパレット番号とビットパターンを出力
      // ※ 実際のSixel変換では、6ピクセル分を1文字で表現する必要がありますが、
      //    ここではシンプルな例として「#<パレット番号><文字>」を連続出力します。
      output += `#${data[i]}${chars[y % 6]}`;
      i++;
    }
    // 行の終わりでキャリッジリターンを出力。6行ごとに '-' を付加して次のブロックに移動。
    if (y > 0 && (y + 1) % 6 === 0) {
      output += '$-';
    } else {
      output += '$';
    }
  }
  output += ESC + '\\'; // Sixel終了シーケンス
  return output;
}

// メイン処理の実行
main();
