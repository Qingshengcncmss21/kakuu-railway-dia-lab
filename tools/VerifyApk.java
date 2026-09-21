import java.io.InputStream;
import java.security.cert.Certificate;
import java.util.Enumeration;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/** Reads every APK entry through Java's JAR verifier and checks V1 signatures. */
public final class VerifyApk {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("Usage: java VerifyApk.java <apk>");
        }
        int signedPayloads = 0;
        try (JarFile jar = new JarFile(args[0], true)) {
            Enumeration<JarEntry> entries = jar.entries();
            byte[] buffer = new byte[8192];
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (entry.isDirectory()) continue;
                try (InputStream stream = jar.getInputStream(entry)) {
                    while (stream.read(buffer) != -1) {
                        // Reading to EOF makes JarVerifier check the digest.
                    }
                }
                if (!entry.getName().startsWith("META-INF/")) {
                    Certificate[] certificates = entry.getCertificates();
                    if (certificates == null || certificates.length == 0) {
                        throw new SecurityException("Unsigned payload: " + entry.getName());
                    }
                    signedPayloads++;
                }
            }
        }
        if (signedPayloads == 0) throw new SecurityException("No signed payloads found");
        System.out.println("Verified " + signedPayloads + " signed APK payloads.");
    }
}
