# ターミナルに動画を表示してみよう

## 自己紹介:murasuke

- 株式会社 ツールラボ 開発部

- 役に立たない技術が好きです

## 早速ですがターミナルで動画を再生します

## なぜ、ターミナルで動画が再生できるのか？

- 実は単なるパラパラ漫画です
- 動画をリアルタイムでパラパラ漫画に変換するには、相当な最適化が必要になるので事前に変換してあります
- ターミナルに画像を表示するために`Sixel Graphics`という機能を使います

## `Sixel Graphics`とは？

Sixel Graphicsは、特別なエスケープシーケンスをターミナルに送信することで、画像を表示する技術です。

特定のエスケープシーケンスを送信することで、色の指定と、文字に対応した縦に6ピクセルの画像を出力することができます。

出力位置を右、下にずらしながら描画を繰り返すことで、画面全体に色を表示することができます。


![alt text](image.png)


## `Sixel Graphics`のデータ構造について


* 全体の構成は下記のようになっています

  `Sixel開始シーケンス,アスペクト比,解像度の指定,カラーパレットの定義,Sixelデータ文字,終了シーケンス`

   * 開始シーケンス、アスペクト比、解像度の指定 は固定なので後述のサンプルを参照

| 文字シーケンス| 概要 | 補足 |
| ---- | ---- |  ---- |
| `\x1BPq` | Sixel開始シーケンス | ESC(\x1B) + 'Pq'  |
| `"1;1;96;96`| アスペクト比1:1、解像度96dpi x 96dpi |  |


## カラーパレット

カラーパレットは色番号(0～255)とそれに対応した色を定義します。ピクセルの描画を行う際は色番号を指定して出力を行います。以下にカラーパレットの定義例を示します。

`#0(色番号);2(RGB指定);(red;green;blue)#1(色番号);2(RGB指定);(red;green;blue)#2・・・`

`#0;2;102;0;0#1;2;0;0;102`


## Sixelデータ文字について

Sixelデータ文字 は、 ? (0x3F) から ~ (0x7E) の範囲の文字です。
直前で指定された色で、縦に6ピクセル分の出力を行います。

| ? (0x3F) | @ (0x40) | A (0x41) | B (0x42) | C (0x43)  |～| ~ (0x7E) |
| ---- | ---- | ---- | ---- | ---- |---- | ---- |
| 000000 | 000001 | 000010 | 000011 | 000100 |～| 111111 |

* `@`は上下6ピクセルのうち一番上のピクセルを、`~`は6ピクセル全てを塗りつぶします

* 塗りつぶしをしないピクセルは`透明`扱いです。既に塗りつぶされたピクセルの色を上書きしません


![alt text](img/sixel-char.png)

6ピクセル別々の色を出力するためには、描画が重ならない文字 `@` ⇒ `A` ⇒ `C` ⇒ `G` ⇒ `O` ⇒ `_` を順に描画します


## 2×2の画像を描画してみよう

![alt text](img/image.png)

一番上を塗りつぶす`@`と、2ピクセル目を塗りつぶす`A`を使い、色の指定と左右の位置を行いながら描画していきます

* 赤(左上@)⇒青(右上@)⇒先頭に戻る($)⇒緑(左下A)⇒白(右下A)の順に1pixelずつ描画
![alt text](image.png)


## 2×2の画像を描画するSixel文字列

`\x1BPq"1;1;96;96#1;2;102;0;0#2;2;0;0;102#3;2;0;102;0#4;2;102;102;102#1@#2@$#3A#4A$\x1B\`

| 文字シーケンス| 概要 | 補足 |
| ---- | ---- |  ---- |
| `\x1BPq` | Sixel開始シーケンス | ESC(\x1B) + 'Pq'  |
| `"1;1;96;96`| アスペクト比1:1、解像度96dpi x 96dpi |  |
| #1;2;102;0;0 | カラーパレットの定義(#1,赤) |  #1(色番号);2(RGB指定);(red;green;blue) |
| #2;2;0;0;102 | カラーパレットの定義(#2,緑) | 〃 |
| #3;2;0;102;0 | カラーパレットの定義(#3,青) | 〃 |
| #4;2;102;102;102 | カラーパレットの定義(#4,灰) |  |
| #1@ | #1で@を描画(して右に1ピクセルずれる) | @は縦に6pixelのうち先頭1pxのみ |
| #2@ | #2で@を描画(して右に1ピクセルずれる) | 〃 |
| $ | 描画位置を行頭に戻す | `$-`は次の行(6pixel下)の先頭へ移動 |
| #3A | #3でAを描画(して右に1ピクセルずれる) | Aは縦に6pixelのうち2px目のみ |
| #4A |  #3でAを描画(して右に1ピクセルずれる) | 〃 |
| \x1B\ | Sixel終了シーケンス |  ESC(\x1B) + '/' |

## では変換プログラムを書いてみましょう(TypeScript)


1. **main()**: 下記処理を呼び出すメイン関数です。
1. **imageLoader()**: 画像ファイルを読み込み、Canvasを使用してそのピクセルデータを取得します。
1. **reductionColor()**: 画像の色を216色のWebセーフパレットに減色します。
1. **convertToSixel()**: 減色されたデータをSixel Graphics文字列に変換します。


## まず、動画から画像への切り出しを行います

ffmpegで下記のコマンドを実行します


## main()関数

```ts
import { loadImage, createCanvas, Image } from 'canvas';

// 画像読み込みとピクセルデータ取得
const { data, img } = await imageLoader(filename);
// 減色処理: 各ピクセルの色を減色して、パレット番号に変換する
const { colorData, colorMap } = reductionColor(data, img.width, img.height);
// Sixelグラフィックス(エスケープシーケンス)文字列に変換
const sixel = convertToSixel(colorData, colorMap, img.width, img.height);
// コンソールに表示
console.log(sixel);
```

## imageLoader()

```ts
  // 画像読み込み
  const img = await loadImage(filename);
  // 画像と同じサイズのCanvasを作成し、画像を描画する
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Canvasからピクセルデータを取得
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  return { data, img };
```

## reductionColor()

```ts
// ピクセルデータの配列(左上からピクセル毎にパレット番号をセット)
const colorData = new Uint32Array(width * height);
// 色を一意に識別するための Map (RGB値 -> パレット番号)
const colorMap = new Map<number, number>();
const quantize = 51; // 0, 51, 102, ... ,255 の6段階に丸める（216色セーフカラー）
const scaleFactor = 0.56; // 各色成分を見た目に近い形へ調整(明るさを抑える。値は目視で適当に調整)

for (let i = 0; i < width * height; i++) {
  const offset = i * 4;
  const a = data[offset + 3];

  // 減色前に各色成分にスケールファクターを適用（高輝度部分が白に偏らないように調整）
  const scaledR = data[offset] * scaleFactor;
  const scaledG = data[offset + 1] * scaleFactor;
  const scaledB = data[offset + 2] * scaleFactor;

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

return { colorData, colorMap };
```

## convertToSixel()

```ts
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
```


## 注意点

* **Sixelサポート:** 出力を正しく表示するには、ターミナルエミュレータがSixelグラフィックスをサポートしている必要があります。

* **Windowsターミナル:** Windowsターミナルでは、Node.jsの実行時に拡張子 `.exe` を明示的に指定する必要がある場合があります。
  ```bash
  node.exe sixelConverter.js <画像ファイル>
  ```
* **パフォーマンス:** 最適化が不十分なため、処理に時間がかかる場合があります。
    ```bash
    node.exe sixelConverter.js <画像ファイル>
    ```

## まとめ

* 一部のターミナルはピクセル単位で色の出力をすることができる
* PCが十分に高速化したため、最適化しないSixelグラフィックスでもパラパラ漫画程度であれば表示できるに至った
* 今回はローカルPCで描画処理を行ったが、実際はSSHで接続してリモートでシェルスクリプトを実行し、リモート先の動画を表示することができる
* その気？になれば、動画からリアルタイムにSixelへ変換することで事前レンダリングなしで動画を表示できる
