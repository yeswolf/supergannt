# Keep Tauri + SuperGantt Android plugins (reflection / JNI class names).
-keep class com.supergannt.planner.** { *; }
-keep class app.tauri.** { *; }
-keepclassmembers class * {
    @app.tauri.annotation.Command <methods>;
}
-keep class net.sf.mpxj.** { *; }
-keep class org.apache.poi.** { *; }
-keep class org.mpxj.** { *; }
-dontwarn java.awt.**
-dontwarn javax.xml.stream.**
-dontwarn org.apache.poi.**
-dontwarn net.sf.mpxj.**
