#!/usr/bin/env python3
"""Build a small, self-contained Android APK without Gradle or the Android SDK.

The app shell is a tiny Activity encoded directly as DEX. It opens the offline
HTML application from android_asset. The APK is JAR-signed with a local,
self-signed certificate so it can be installed directly on Android devices.
"""

from __future__ import annotations

import base64
import hashlib
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app" / "src" / "main" / "assets"
BUILD = ROOT / "build"
DIST = ROOT / "dist"
APK_PATH = DIST / "KakuuRailwayDiaLab.apk"
PACKAGE_NAME = "jp.dialab.kakuu"
ACTIVITY_NAME = "jp.dialab.kakuu.MainActivity"
APP_LABEL = "架空鉄道ダイヤ工房"
NO_INDEX = 0xFFFFFFFF
APK_SIGNATURE_SCHEME_V2_ID = 0x7109871A
APK_SIGNATURE_ALGORITHM_RSA_PKCS1_SHA256 = 0x0103
APK_SIGNING_BLOCK_MAGIC = b"APK Sig Block 42"


def align(data: bytearray, boundary: int = 4) -> None:
    while len(data) % boundary:
        data.append(0)


def uleb128(value: int) -> bytes:
    if value < 0:
        raise ValueError("ULEB128 only accepts non-negative integers")
    output = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            output.append(byte | 0x80)
        else:
            output.append(byte)
            return bytes(output)


def encode_utf8_length(value: int) -> bytes:
    if value <= 0x7F:
        return bytes((value,))
    if value > 0x7FFF:
        raise ValueError("String is too long for this compact string pool")
    return bytes(((value >> 8) | 0x80, value & 0xFF))


def make_string_pool(strings: list[str]) -> bytes:
    encoded = bytearray()
    offsets: list[int] = []
    for value in strings:
        utf8 = value.encode("utf-8")
        utf16_length = len(value.encode("utf-16-le")) // 2
        offsets.append(len(encoded))
        encoded.extend(encode_utf8_length(utf16_length))
        encoded.extend(encode_utf8_length(len(utf8)))
        encoded.extend(utf8)
        encoded.append(0)
    while len(encoded) % 4:
        encoded.append(0)
    header_size = 28
    strings_start = header_size + 4 * len(strings)
    chunk_size = strings_start + len(encoded)
    return b"".join(
        (
            struct.pack("<HHI", 0x0001, header_size, chunk_size),
            struct.pack("<IIIII", len(strings), 0, 0x00000100, strings_start, 0),
            b"".join(struct.pack("<I", item) for item in offsets),
            bytes(encoded),
        )
    )


def make_binary_manifest() -> bytes:
    resource_names = [
        ("label", 0x01010001),
        ("name", 0x01010003),
        ("exported", 0x01010010),
        ("minSdkVersion", 0x0101020C),
        ("versionCode", 0x0101021B),
        ("versionName", 0x0101021C),
        ("targetSdkVersion", 0x01010270),
    ]
    values = [name for name, _ in resource_names]

    def add(value: str) -> None:
        if value not in values:
            values.append(value)

    for value in (
        "android",
        "http://schemas.android.com/apk/res/android",
        "manifest",
        "package",
        PACKAGE_NAME,
        "1.4.0",
        "uses-sdk",
        "application",
        APP_LABEL,
        "activity",
        ACTIVITY_NAME,
        "intent-filter",
        "action",
        "android.intent.action.MAIN",
        "category",
        "android.intent.category.LAUNCHER",
    ):
        add(value)

    index = {value: position for position, value in enumerate(values)}
    android_uri = index["http://schemas.android.com/apk/res/android"]

    def node_header(chunk_type: int, size: int, line: int = 1) -> bytes:
        return struct.pack("<HHIII", chunk_type, 16, size, line, NO_INDEX)

    def namespace(chunk_type: int) -> bytes:
        return node_header(chunk_type, 24) + struct.pack("<II", index["android"], android_uri)

    def attr(namespace_index: int, name: str, raw: int, data_type: int, data: int) -> bytes:
        return struct.pack("<IIIHBBI", namespace_index, index[name], raw, 8, 0, data_type, data)

    def string_attr(namespace_index: int, name: str, value: str) -> bytes:
        return attr(namespace_index, name, index[value], 0x03, index[value])

    def int_attr(namespace_index: int, name: str, value: int) -> bytes:
        return attr(namespace_index, name, NO_INDEX, 0x10, value)

    def bool_attr(namespace_index: int, name: str, value: bool) -> bytes:
        return attr(namespace_index, name, NO_INDEX, 0x12, NO_INDEX if value else 0)

    def start_element(name: str, attributes: list[bytes]) -> bytes:
        size = 36 + 20 * len(attributes)
        extension = struct.pack("<IIHHHHHH", NO_INDEX, index[name], 20, 20, len(attributes), 0, 0, 0)
        return node_header(0x0102, size) + extension + b"".join(attributes)

    def end_element(name: str) -> bytes:
        return node_header(0x0103, 24) + struct.pack("<II", NO_INDEX, index[name])

    chunks = [make_string_pool(values)]
    resource_map = [resource_id for _, resource_id in resource_names]
    chunks.append(struct.pack("<HHI", 0x0180, 8, 8 + 4 * len(resource_map)))
    chunks.append(b"".join(struct.pack("<I", item) for item in resource_map))
    chunks.append(namespace(0x0100))
    chunks.append(
        start_element(
            "manifest",
            [
                string_attr(NO_INDEX, "package", PACKAGE_NAME),
                int_attr(android_uri, "versionCode", 6),
                string_attr(android_uri, "versionName", "1.4.0"),
            ],
        )
    )
    chunks.append(start_element("uses-sdk", [int_attr(android_uri, "minSdkVersion", 23), int_attr(android_uri, "targetSdkVersion", 35)]))
    chunks.append(end_element("uses-sdk"))
    chunks.append(start_element("application", [string_attr(android_uri, "label", APP_LABEL)]))
    chunks.append(start_element("activity", [string_attr(android_uri, "name", ACTIVITY_NAME), bool_attr(android_uri, "exported", True)]))
    chunks.append(start_element("intent-filter", []))
    chunks.append(start_element("action", [string_attr(android_uri, "name", "android.intent.action.MAIN")]))
    chunks.append(end_element("action"))
    chunks.append(start_element("category", [string_attr(android_uri, "name", "android.intent.category.LAUNCHER")]))
    chunks.append(end_element("category"))
    chunks.append(end_element("intent-filter"))
    chunks.append(end_element("activity"))
    chunks.append(end_element("application"))
    chunks.append(end_element("manifest"))
    chunks.append(namespace(0x0101))
    body = b"".join(chunks)
    return struct.pack("<HHI", 0x0003, 8, len(body) + 8) + body


def make_dex() -> bytes:
    main_class = "Ljp/dialab/kakuu/MainActivity;"
    activity = "Landroid/app/Activity;"
    bundle = "Landroid/os/Bundle;"
    context = "Landroid/content/Context;"
    view = "Landroid/view/View;"
    webview = "Landroid/webkit/WebView;"
    websettings = "Landroid/webkit/WebSettings;"
    string_class = "Ljava/lang/String;"
    void = "V"
    boolean = "Z"
    integer = "I"
    url = "file:///android_asset/index.html"

    prototypes = {
        (void, ()),
        (void, (bundle,)),
        (void, (context,)),
        (websettings, ()),
        (void, (boolean,)),
        (void, (view,)),
        (void, (string_class,)),
        (boolean, (integer,)),
    }

    methods = {
        (activity, "<init>", (void, ())),
        (activity, "onCreate", (void, (bundle,))),
        (activity, "requestWindowFeature", (boolean, (integer,))),
        (activity, "setContentView", (void, (view,))),
        (websettings, "setDomStorageEnabled", (void, (boolean,))),
        (websettings, "setJavaScriptEnabled", (void, (boolean,))),
        (webview, "<init>", (void, (context,))),
        (webview, "getSettings", (websettings, ())),
        (webview, "loadUrl", (void, (string_class,))),
        (main_class, "<init>", (void, ())),
        (main_class, "onCreate", (void, (bundle,))),
    }

    descriptors = {main_class, activity, bundle, context, view, webview, websettings, string_class, void, boolean, integer}

    def shorty(proto: tuple[str, tuple[str, ...]]) -> str:
        result, parameters = proto
        compact = lambda descriptor: descriptor if len(descriptor) == 1 else "L"
        return compact(result) + "".join(compact(item) for item in parameters)

    string_values = {url, "<init>", "onCreate", "requestWindowFeature", "setContentView", "setDomStorageEnabled", "setJavaScriptEnabled", "getSettings", "loadUrl"}
    string_values.update(descriptors)
    string_values.update(shorty(proto) for proto in prototypes)
    strings = sorted(string_values)
    string_index = {value: idx for idx, value in enumerate(strings)}

    types = sorted(descriptors, key=lambda value: string_index[value])
    type_index = {value: idx for idx, value in enumerate(types)}
    proto_list = sorted(prototypes, key=lambda proto: (type_index[proto[0]], tuple(type_index[item] for item in proto[1])))
    proto_index = {proto: idx for idx, proto in enumerate(proto_list)}
    method_list = sorted(methods, key=lambda item: (type_index[item[0]], string_index[item[1]], proto_index[item[2]]))
    method_index = {method: idx for idx, method in enumerate(method_list)}

    header_size = 112
    string_ids_off = header_size
    type_ids_off = string_ids_off + 4 * len(strings)
    proto_ids_off = type_ids_off + 4 * len(types)
    method_ids_off = proto_ids_off + 12 * len(proto_list)
    class_defs_off = method_ids_off + 8 * len(method_list)
    data_off = class_defs_off + 32
    if data_off % 4:
        data_off += 4 - data_off % 4

    data = bytearray()
    string_data_offsets: list[int] = []
    for value in strings:
        string_data_offsets.append(data_off + len(data))
        encoded = value.encode("utf-8")
        data.extend(uleb128(len(value.encode("utf-16-le")) // 2))
        data.extend(encoded)
        data.append(0)

    align(data)
    type_list_offsets: dict[tuple[str, ...], int] = {}
    for parameters in sorted({proto[1] for proto in proto_list if proto[1]}, key=lambda items: tuple(type_index[item] for item in items)):
        type_list_offsets[parameters] = data_off + len(data)
        data.extend(struct.pack("<I", len(parameters)))
        for parameter in parameters:
            data.extend(struct.pack("<H", type_index[parameter]))
        align(data)

    def invoke(opcode: int, method: tuple[str, str, tuple[str, tuple[str, ...]]], registers: list[int]) -> list[int]:
        if len(registers) > 5 or any(register > 15 for register in registers):
            raise ValueError("invoke-35c register limit exceeded")
        padded = registers + [0] * (5 - len(registers))
        c, d, e, f, g = padded
        first = opcode | (g << 8) | (len(registers) << 12)
        third = c | (d << 4) | (e << 8) | (f << 12)
        return [first, method_index[method], third]

    def code_item(registers: int, incoming: int, outgoing: int, instructions: list[int]) -> bytes:
        return struct.pack("<HHHHII", registers, incoming, outgoing, 0, 0, len(instructions)) + struct.pack(f"<{len(instructions)}H", *instructions)

    constructor_instructions = invoke(0x70, (activity, "<init>", (void, ())), [0]) + [0x000E]
    align(data)
    constructor_code_off = data_off + len(data)
    data.extend(code_item(1, 1, 1, constructor_instructions))

    # onCreate uses v0=WebView, v1=WebSettings/String, v2=true/feature,
    # p0=v3=Activity and p1=v4=Bundle.
    on_create: list[int] = []
    on_create += invoke(0x6F, (activity, "onCreate", (void, (bundle,))), [3, 4])
    on_create += [0x1212]  # const/4 v2, #1
    on_create += invoke(0x6E, (activity, "requestWindowFeature", (boolean, (integer,))), [3, 2])
    on_create += [0x0022, type_index[webview]]  # new-instance v0, WebView
    on_create += invoke(0x70, (webview, "<init>", (void, (context,))), [0, 3])
    on_create += invoke(0x6E, (webview, "getSettings", (websettings, ())), [0])
    on_create += [0x010C]  # move-result-object v1
    on_create += invoke(0x6E, (websettings, "setJavaScriptEnabled", (void, (boolean,))), [1, 2])
    on_create += invoke(0x6E, (websettings, "setDomStorageEnabled", (void, (boolean,))), [1, 2])
    on_create += invoke(0x6E, (activity, "setContentView", (void, (view,))), [3, 0])
    on_create += [0x011A, string_index[url]]  # const-string v1, URL
    on_create += invoke(0x6E, (webview, "loadUrl", (void, (string_class,))), [0, 1])
    on_create += [0x000E]
    align(data)
    on_create_code_off = data_off + len(data)
    data.extend(code_item(5, 2, 2, on_create))

    class_data_off = data_off + len(data)
    class_data = bytearray()
    class_data.extend(uleb128(0))  # static fields
    class_data.extend(uleb128(0))  # instance fields
    class_data.extend(uleb128(1))  # direct methods
    class_data.extend(uleb128(1))  # virtual methods
    constructor_method_index = method_index[(main_class, "<init>", (void, ()))]
    on_create_method_index = method_index[(main_class, "onCreate", (void, (bundle,)))]
    class_data.extend(uleb128(constructor_method_index))
    class_data.extend(uleb128(0x10001))  # public | constructor
    class_data.extend(uleb128(constructor_code_off))
    class_data.extend(uleb128(on_create_method_index))
    class_data.extend(uleb128(0x0004))  # protected
    class_data.extend(uleb128(on_create_code_off))
    data.extend(class_data)

    align(data)
    map_off = data_off + len(data)
    maps = [
        (0x0000, 1, 0),
        (0x0001, len(strings), string_ids_off),
        (0x0002, len(types), type_ids_off),
        (0x0003, len(proto_list), proto_ids_off),
        (0x0005, len(method_list), method_ids_off),
        (0x0006, 1, class_defs_off),
        (0x2002, len(strings), string_data_offsets[0]),
    ]
    if type_list_offsets:
        maps.append((0x1001, len(type_list_offsets), min(type_list_offsets.values())))
    maps.extend(
        [
            (0x2001, 2, constructor_code_off),
            (0x2000, 1, class_data_off),
            (0x1000, 1, map_off),
        ]
    )
    maps.sort(key=lambda item: item[2])
    data.extend(struct.pack("<I", len(maps)))
    for item_type, count, offset in maps:
        data.extend(struct.pack("<HHII", item_type, 0, count, offset))

    proto_ids = bytearray()
    for proto in proto_list:
        result, parameters = proto
        proto_ids.extend(struct.pack("<III", string_index[shorty(proto)], type_index[result], type_list_offsets.get(parameters, 0)))

    method_ids = bytearray()
    for class_name, method_name, proto in method_list:
        method_ids.extend(struct.pack("<HHI", type_index[class_name], proto_index[proto], string_index[method_name]))

    class_def = struct.pack(
        "<IIIIIIII",
        type_index[main_class],
        0x00000021,  # public | super
        type_index[activity],
        0,
        NO_INDEX,
        0,
        class_data_off,
        0,
    )

    ids = bytearray()
    ids.extend(b"".join(struct.pack("<I", item) for item in string_data_offsets))
    ids.extend(b"".join(struct.pack("<I", string_index[item]) for item in types))
    ids.extend(proto_ids)
    ids.extend(method_ids)
    ids.extend(class_def)
    while header_size + len(ids) < data_off:
        ids.append(0)

    file_size = data_off + len(data)
    header = bytearray(112)
    header[0:8] = b"dex\n035\x00"
    struct.pack_into(
        "<20I",
        header,
        32,
        file_size,
        header_size,
        0x12345678,
        0,
        0,
        map_off,
        len(strings),
        string_ids_off,
        len(types),
        type_ids_off,
        len(proto_list),
        proto_ids_off,
        0,
        0,
        len(method_list),
        method_ids_off,
        1,
        class_defs_off,
        len(data),
        data_off,
    )
    dex = header + ids + data
    dex[12:32] = hashlib.sha1(dex[32:]).digest()
    struct.pack_into("<I", dex, 8, zlib.adler32(dex[12:]) & 0xFFFFFFFF)
    return bytes(dex)


def manifest_section(name: str, data: bytes) -> bytes:
    digest = base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")
    return f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n".encode("utf-8")


def sf_section(name: str, manifest_entry: bytes) -> bytes:
    digest = base64.b64encode(hashlib.sha256(manifest_entry).digest()).decode("ascii")
    return f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n".encode("utf-8")


def ensure_signing_material() -> tuple[Path, Path]:
    signing = BUILD / "signing"
    key = signing / "dialab-release-key.pem"
    certificate = signing / "dialab-release-cert.pem"
    if key.exists() and certificate.exists():
        return key, certificate
    if not shutil.which("openssl"):
        raise RuntimeError("OpenSSL was not found. It is required to sign the APK.")
    signing.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
            "-days", "3650", "-subj", "/CN=Kakuu Railway Dia Lab/O=Dia Lab/C=JP",
            "-keyout", str(key), "-out", str(certificate),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    os.chmod(key, 0o600)
    return key, certificate


def zip_write(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def length_prefixed(value: bytes) -> bytes:
    return struct.pack("<I", len(value)) + value


def find_eocd(apk: bytes) -> int:
    """Locate a non-ZIP64 End of Central Directory record."""
    minimum = max(0, len(apk) - 22 - 0xFFFF)
    offset = len(apk)
    while True:
        offset = apk.rfind(b"PK\x05\x06", minimum, offset)
        if offset < 0:
            raise RuntimeError("ZIP End of Central Directory was not found")
        if offset + 22 <= len(apk):
            comment_length = struct.unpack_from("<H", apk, offset + 20)[0]
            if offset + 22 + comment_length == len(apk):
                return offset


def chunked_apk_digest(sections: list[bytes]) -> bytes:
    chunk_digests: list[bytes] = []
    for section in sections:
        for start in range(0, len(section), 1024 * 1024):
            chunk = section[start:start + 1024 * 1024]
            prefix = b"\xA5" + struct.pack("<I", len(chunk))
            chunk_digests.append(hashlib.sha256(prefix + chunk).digest())
    top_level = b"\x5A" + struct.pack("<I", len(chunk_digests)) + b"".join(chunk_digests)
    return hashlib.sha256(top_level).digest()


def openssl_bytes(arguments: list[str], input_data: bytes | None = None) -> bytes:
    process = subprocess.run(
        ["openssl", *arguments],
        input=input_data,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return process.stdout


def add_v2_signature(unsigned_apk: bytes, key: Path, certificate: Path) -> bytes:
    """Add an APK Signature Scheme v2 block to an already V1-signed ZIP."""
    eocd_offset = find_eocd(unsigned_apk)
    central_directory_size = struct.unpack_from("<I", unsigned_apk, eocd_offset + 12)[0]
    central_directory_offset = struct.unpack_from("<I", unsigned_apk, eocd_offset + 16)[0]
    if central_directory_offset + central_directory_size != eocd_offset:
        raise RuntimeError("Unexpected ZIP Central Directory layout")

    before_signing_block = unsigned_apk[:central_directory_offset]
    central_directory = unsigned_apk[central_directory_offset:eocd_offset]
    eocd_for_digest = bytearray(unsigned_apk[eocd_offset:])
    # In the protected EOCD, the Central Directory offset is treated as the
    # offset of the signing block, as required by APK Signature Scheme v2.
    struct.pack_into("<I", eocd_for_digest, 16, central_directory_offset)
    content_digest = chunked_apk_digest([before_signing_block, central_directory, bytes(eocd_for_digest)])

    certificate_der = openssl_bytes(["x509", "-in", str(certificate), "-outform", "DER"])
    public_key_der = openssl_bytes(["pkey", "-in", str(key), "-pubout", "-outform", "DER"])
    digest_record = struct.pack("<I", APK_SIGNATURE_ALGORITHM_RSA_PKCS1_SHA256) + length_prefixed(content_digest)
    signed_data = (
        length_prefixed(length_prefixed(digest_record))
        + length_prefixed(length_prefixed(certificate_der))
        + length_prefixed(b"")
    )
    signature = openssl_bytes(["dgst", "-sha256", "-sign", str(key)], signed_data)
    signature_record = struct.pack("<I", APK_SIGNATURE_ALGORITHM_RSA_PKCS1_SHA256) + length_prefixed(signature)
    signer = (
        length_prefixed(signed_data)
        + length_prefixed(length_prefixed(signature_record))
        + length_prefixed(public_key_der)
    )
    v2_value = length_prefixed(length_prefixed(signer))
    pair = (
        struct.pack("<Q", 4 + len(v2_value))
        + struct.pack("<I", APK_SIGNATURE_SCHEME_V2_ID)
        + v2_value
    )
    block_size = len(pair) + 8 + len(APK_SIGNING_BLOCK_MAGIC)
    signing_block = (
        struct.pack("<Q", block_size)
        + pair
        + struct.pack("<Q", block_size)
        + APK_SIGNING_BLOCK_MAGIC
    )

    final_eocd = bytearray(unsigned_apk[eocd_offset:])
    struct.pack_into("<I", final_eocd, 16, central_directory_offset + len(signing_block))
    return before_signing_block + signing_block + central_directory + bytes(final_eocd)


def read_length_prefixed(data: bytes, offset: int) -> tuple[bytes, int]:
    if offset + 4 > len(data):
        raise RuntimeError("Truncated length-prefixed APK signing field")
    size = struct.unpack_from("<I", data, offset)[0]
    start = offset + 4
    end = start + size
    if end > len(data):
        raise RuntimeError("APK signing field exceeds its container")
    return data[start:end], end


def verify_v2_signature(apk: bytes) -> None:
    """Parse and cryptographically verify the single V2 signer we emit."""
    eocd_offset = find_eocd(apk)
    central_directory_offset = struct.unpack_from("<I", apk, eocd_offset + 16)[0]
    if apk[central_directory_offset - 16:central_directory_offset] != APK_SIGNING_BLOCK_MAGIC:
        raise RuntimeError("APK Signature Scheme v2 block is missing")
    trailing_size = struct.unpack_from("<Q", apk, central_directory_offset - 24)[0]
    block_start = central_directory_offset - trailing_size - 8
    if block_start < 0 or struct.unpack_from("<Q", apk, block_start)[0] != trailing_size:
        raise RuntimeError("APK signing block size fields do not match")

    pairs_end = central_directory_offset - 24
    cursor = block_start + 8
    v2_value = None
    while cursor < pairs_end:
        if cursor + 8 > pairs_end:
            raise RuntimeError("Truncated APK signing pair")
        pair_size = struct.unpack_from("<Q", apk, cursor)[0]
        pair_start = cursor + 8
        pair_end = pair_start + pair_size
        if pair_size < 4 or pair_end > pairs_end:
            raise RuntimeError("Invalid APK signing pair length")
        pair_id = struct.unpack_from("<I", apk, pair_start)[0]
        if pair_id == APK_SIGNATURE_SCHEME_V2_ID:
            v2_value = apk[pair_start + 4:pair_end]
        cursor = pair_end
    if cursor != pairs_end or v2_value is None:
        raise RuntimeError("APK Signature Scheme v2 pair was not found")

    signers, end = read_length_prefixed(v2_value, 0)
    if end != len(v2_value):
        raise RuntimeError("Trailing bytes after V2 signer sequence")
    signer, signer_end = read_length_prefixed(signers, 0)
    if signer_end != len(signers):
        raise RuntimeError("This builder expects exactly one V2 signer")
    signed_data, cursor = read_length_prefixed(signer, 0)
    signatures, cursor = read_length_prefixed(signer, cursor)
    public_key_der, cursor = read_length_prefixed(signer, cursor)
    if cursor != len(signer):
        raise RuntimeError("Trailing bytes in V2 signer")

    digest_records, cursor = read_length_prefixed(signed_data, 0)
    certificate_records, cursor = read_length_prefixed(signed_data, cursor)
    _, cursor = read_length_prefixed(signed_data, cursor)
    if cursor != len(signed_data):
        raise RuntimeError("Trailing bytes in V2 signed data")
    digest_record, end = read_length_prefixed(digest_records, 0)
    if end != len(digest_records):
        raise RuntimeError("Unexpected extra V2 digest")
    digest_algorithm = struct.unpack_from("<I", digest_record, 0)[0]
    expected_digest, digest_end = read_length_prefixed(digest_record, 4)
    if digest_end != len(digest_record) or digest_algorithm != APK_SIGNATURE_ALGORITHM_RSA_PKCS1_SHA256:
        raise RuntimeError("Unexpected V2 digest algorithm")

    signature_record, end = read_length_prefixed(signatures, 0)
    if end != len(signatures):
        raise RuntimeError("Unexpected extra V2 signature")
    signature_algorithm = struct.unpack_from("<I", signature_record, 0)[0]
    signature, signature_end = read_length_prefixed(signature_record, 4)
    if signature_end != len(signature_record) or signature_algorithm != digest_algorithm:
        raise RuntimeError("V2 digest and signature algorithms differ")

    certificate_der, cert_end = read_length_prefixed(certificate_records, 0)
    if cert_end != len(certificate_records):
        raise RuntimeError("Unexpected extra V2 certificate")
    certificate_public_pem = openssl_bytes(["x509", "-inform", "DER", "-pubkey", "-noout"], certificate_der)
    certificate_public_der = openssl_bytes(["pkey", "-pubin", "-outform", "DER"], certificate_public_pem)
    if certificate_public_der != public_key_der:
        raise RuntimeError("V2 certificate and public key differ")

    central_directory_size = struct.unpack_from("<I", apk, eocd_offset + 12)[0]
    if central_directory_offset + central_directory_size != eocd_offset:
        raise RuntimeError("Central Directory is not immediately followed by EOCD")
    eocd_for_digest = bytearray(apk[eocd_offset:])
    struct.pack_into("<I", eocd_for_digest, 16, block_start)
    actual_digest = chunked_apk_digest([
        apk[:block_start],
        apk[central_directory_offset:eocd_offset],
        bytes(eocd_for_digest),
    ])
    if actual_digest != expected_digest:
        raise RuntimeError("APK V2 content digest mismatch")

    with tempfile.TemporaryDirectory(prefix="dialab-v2-verify-") as temporary:
        temp = Path(temporary)
        public_key_path = temp / "public.der"
        signature_path = temp / "signature.bin"
        signed_data_path = temp / "signed-data.bin"
        public_key_path.write_bytes(public_key_der)
        signature_path.write_bytes(signature)
        signed_data_path.write_bytes(signed_data)
        subprocess.run(
            [
                "openssl", "dgst", "-sha256", "-verify", str(public_key_path),
                "-keyform", "DER", "-signature", str(signature_path), str(signed_data_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def build_apk() -> Path:
    required_assets = ["index.html", "app.css", "app.js"]
    for filename in required_assets:
        if not (ASSETS / filename).is_file():
            raise FileNotFoundError(f"Missing asset: {filename}")

    payload: dict[str, bytes] = {
        "AndroidManifest.xml": make_binary_manifest(),
        "classes.dex": make_dex(),
    }
    for filename in required_assets:
        payload[f"assets/{filename}"] = (ASSETS / filename).read_bytes()

    main = b"Manifest-Version: 1.0\r\nCreated-By: DIA Lab Builder\r\n\r\n"
    entry_sections = {name: manifest_section(name, data) for name, data in payload.items()}
    jar_manifest = main + b"".join(entry_sections.values())
    signature_file = (
        b"Signature-Version: 1.0\r\nCreated-By: DIA Lab Builder\r\nX-Android-APK-Signed: 2\r\n"
        + f"SHA-256-Digest-Manifest: {base64.b64encode(hashlib.sha256(jar_manifest).digest()).decode('ascii')}\r\n\r\n".encode("ascii")
        + b"".join(sf_section(name, section) for name, section in entry_sections.items())
    )

    key, certificate = ensure_signing_material()
    BUILD.mkdir(parents=True, exist_ok=True)
    DIST.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="dialab-sign-") as temporary:
        temp = Path(temporary)
        sf_path = temp / "CERT.SF"
        rsa_path = temp / "CERT.RSA"
        sf_path.write_bytes(signature_file)
        subprocess.run(
            [
                "openssl", "smime", "-sign", "-binary", "-noattr", "-md", "sha256",
                "-in", str(sf_path), "-signer", str(certificate), "-inkey", str(key),
                "-outform", "DER", "-out", str(rsa_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with zipfile.ZipFile(APK_PATH, "w") as archive:
            for name, data in payload.items():
                zip_write(archive, name, data)
            zip_write(archive, "META-INF/MANIFEST.MF", jar_manifest)
            zip_write(archive, "META-INF/CERT.SF", signature_file)
            zip_write(archive, "META-INF/CERT.RSA", rsa_path.read_bytes())
    APK_PATH.write_bytes(add_v2_signature(APK_PATH.read_bytes(), key, certificate))
    return APK_PATH


def validate_outputs(apk: Path) -> None:
    verify_v2_signature(apk.read_bytes())
    with zipfile.ZipFile(apk) as archive:
        expected = {
            "AndroidManifest.xml", "classes.dex", "assets/index.html", "assets/app.css", "assets/app.js",
            "META-INF/MANIFEST.MF", "META-INF/CERT.SF", "META-INF/CERT.RSA",
        }
        names = set(archive.namelist())
        missing = expected - names
        if missing:
            raise RuntimeError(f"APK validation failed; missing {sorted(missing)}")
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"APK contains a corrupt ZIP entry: {bad}")
        dex = archive.read("classes.dex")
        if dex[:8] != b"dex\n035\x00":
            raise RuntimeError("Invalid DEX magic")
        if struct.unpack_from("<I", dex, 8)[0] != zlib.adler32(dex[12:]) & 0xFFFFFFFF:
            raise RuntimeError("DEX Adler-32 mismatch")
        if dex[12:32] != hashlib.sha1(dex[32:]).digest():
            raise RuntimeError("DEX SHA-1 mismatch")
        axml = archive.read("AndroidManifest.xml")
        if struct.unpack_from("<H", axml, 0)[0] != 0x0003 or struct.unpack_from("<I", axml, 4)[0] != len(axml):
            raise RuntimeError("Invalid binary AndroidManifest.xml")
        if b"X-Android-APK-Signed: 2\r\n" not in archive.read("META-INF/CERT.SF"):
            raise RuntimeError("V1 rollback protection attribute is missing")


def main() -> int:
    try:
        apk = build_apk()
        validate_outputs(apk)
    except Exception as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    print(f"Built: {apk}")
    print(f"Size: {apk.stat().st_size:,} bytes")
    print(f"SHA-256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
