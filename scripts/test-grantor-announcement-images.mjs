import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { addAnnouncementImageFiles, MAX_ANNOUNCEMENT_IMAGE_BYTES } from "../src/utils/announcementImages.js"

const source = (await readFile(new URL("../src/pages/ProviderDashboard.jsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n")
const handler = source.match(/const selectAnnouncementImages = \(fileList\) => \{([\s\S]*?)\n\t\}/)[1]

function select(files, incoming) {
	let value = files
	const errors = []
	const deferred = []
	const run = new Function("fileList", "announcementImageFiles", "addAnnouncementImageFiles", "setAnnouncementImageFiles", "setAnnouncementAudiencePreview", "toast", handler)
	run(incoming, files, addAnnouncementImageFiles, (update) => deferred.push(update), () => {}, { error: (message) => errors.push(message) })
	incoming.length = 0
	for (const update of deferred) value = typeof update === "function" ? update(value) : update
	return { files: value, errors }
}

const image = (name = "photo.png", type = "image/png", size = 100) => ({ name, type, size })

test("selection survives clearing the live file list before React applies state", () => {
	const file = image()
	assert.deepEqual(select([], [file]), { files: [file], errors: [] })
})

test("adding another image keeps earlier selections", () => {
	const first = image()
	const second = image("second.webp", "image/webp")
	assert.deepEqual(select([first], [second]).files, [first, second])
})

test("cancelling the picker preserves selections", () => {
	const first = image()
	assert.deepEqual(select([first], []).files, [first])
})

for (const [label, selected] of [
	["invalid file type", image("file.pdf", "application/pdf")],
	["oversized image", image("large.jpg", "image/jpeg", MAX_ANNOUNCEMENT_IMAGE_BYTES + 1)],
	["empty image", image("empty.png", "image/png", 0)],
]) {
	test(`${label} is reported without changing selected files`, () => {
		const first = image()
		const result = select([first], [selected])
		assert.deepEqual(result.files, [first])
		assert.equal(result.errors.length, 1)
	})
}

test("five images are allowed and a sixth is rejected safely", () => {
	const files = Array.from({ length: 5 }, (_, index) => image(`${index}.png`))
	assert.equal(select([], [...files]).files.length, 5)
	assert.equal(select(files, [image("sixth.png")]).errors.length, 1)
})

test("preview cleanup releases only URLs belonging to that effect", () => {
	const body = source.match(/useEffect\(\(\) => \{\n\t\tconst previews = announcementImageFiles\.map([\s\S]*?)\n\t\}, \[announcementImageFiles\]\)/)[0]
	const effect = body.slice("useEffect(() => {".length, body.lastIndexOf("\n\t},"))
	let current = []
	let nextId = 0
	const revoked = []
	const urls = { createObjectURL: () => `blob:test-${++nextId}`, revokeObjectURL: (url) => revoked.push(url) }
	const run = new Function("announcementImageFiles", "setAnnouncementImagePreviews", "URL", effect)
	const firstCleanup = run([image()], (value) => { current = value }, urls)
	assert.deepEqual(revoked, [])
	firstCleanup()
	const secondCleanup = run([image(), image("second.jpg", "image/jpeg")], (value) => { current = value }, urls)
	assert.deepEqual(revoked, ["blob:test-1"])
	assert.equal(current.length, 2)
	assert.ok(current.every((item) => !revoked.includes(item.url)))
	secondCleanup()
	assert.deepEqual(revoked, ["blob:test-1", "blob:test-2", "blob:test-3"])
})
