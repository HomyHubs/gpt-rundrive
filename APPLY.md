# gpt-rundrive — token diet (a → e)

Muc tieu: giam so **tool call** va so **token** moi luot chat, vi tren nhanh agentic cua ChatGPT
moi tool call deu bi tinh quota. Khong file nao trong bo nay lam thay doi hanh vi bao mat
(allowlist, roots, atomic write giu nguyen).

## Cach ap dung

Token GitHub cua toi chi co quyen doc repo nen khong tao branch/PR duoc. Lam thu cong:

```bash
cd /duong/dan/gpt-rundrive
git checkout -b token-diet
# chep 5 file trong scripts/ cua goi nay de len scripts/ cua repo
git add -A && git commit -m "feat: cat token — project_map, batch fs tools, output budget, instructions"
npm start   # kiem tra server len duoc
```

| File | Trang thai | Noi dung |
|---|---|---|
| `scripts/squeeze.js` | **moi** | (c)(e) Ngan sach output chung + hook headroom |
| `scripts/project-map.js` | **moi** | (b) Tool `project_map` |
| `scripts/filesystem-batch-mcp.js` | **moi** | (b)(c) `read_lines`, `write_files`, `edit_files` |
| `scripts/tools-server.js` | **thay the** | (a)(d) tat tool theo config, `instructions`, boc squeeze |
| `scripts/test-mcp.js` | **thay the** | (c) PASS chi tra ve 25 dong cuoi |

`filesystem-mcp.js`, `search-mcp.js`, `shell-mcp.js`, `roots.js`, `allowlist.js` **khong bi dung toi**.

## (a) Giam so tool

Moi tool deu ton token mo ta trong **moi** request. Nhung tool nao la thua thi tuy nguoi dung,
nen toi lam dang cau hinh chu khong xoa code. Them vao `~/.andymcp/mcpsv/setting.json`:

```json
{
  "tools": { "disabled": ["agy_run", "kiro_read", "get_file_info", "create_directory", "move_file", "list_allowed_directories"] }
}
```

13 tool → 8. Neu anh khong dung agy/kiro qua ChatGPT (anh chay agy truc tiep tren may) thi
hai cai do la thua ro nhat.

## (b) Gop tool

- `project_map` — 1 call thay cho chuoi liet ke thu muc + doc package.json.
- `edit_files` — sua nhieu file trong 1 call. Doc + tinh toan het roi moi ghi, nen loi o file cuoi
  se huy ca lo thay vi de lai trang thai nua voi. Co `dryRun`.
- `write_files` — ghi nhieu file trong 1 call.

## (c) Chan output

- `read_lines` voi `offset`/`limit` — doc dung doan can, khong keo ca file.
- `run_test` PASS chi tra 25 dong cuoi; FAIL van tra day du.
- Tran chung cho **moi** tool, chinh trong setting.json:

```json
{ "output": { "maxChars": 12000 } }
```

## (d) instructions

`tools-server.js` gio truyen `instructions` vao `McpServer`. Gui **mot lan** luc initialize, day
model vao thoi quen dung: `project_map` truoc, `read_lines` thay vi doc ca file, gop edit vao 1 call.

## (e) Headroom — tuy chon

Repo la Node ESM, nen dung goi **npm** `headroom-ai` (khong phai ban Python).

```bash
npm install headroom-ai
```

Khong cai cung chay binh thuong: `squeeze.js` dung `await import()` trong try/catch, khong co thi
chi con phan cat cung. Cai vao thi text vuot nguong se qua `compress()` truoc roi moi cat.

**Luu y quan trong:** Headroom nen output cua *server*, tuc la giam token *gui len*. No khong lam
ChatGPT ngung tinh quota — model van chay tren may OpenAI. No lam moi luot re hon, khong doi duoc
cach tinh tien.

## Sau khi xong

Repo dang de **public**. Nen chuyen lai private sau khi merge, va soat `.env.example` xem co
lo key that khong.
