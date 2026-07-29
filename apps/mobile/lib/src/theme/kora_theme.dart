import 'package:flutter/material.dart';

import 'kora_colors.dart';

abstract final class KoraTheme {
  static final ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: KoraColors.background,
    canvasColor: KoraColors.background,
    colorScheme: const ColorScheme.dark(
      primary: KoraColors.gold,
      onPrimary: KoraColors.background,
      secondary: KoraColors.gold,
      onSecondary: KoraColors.background,
      surface: KoraColors.surface,
      onSurface: KoraColors.ivory,
      error: KoraColors.error,
      onError: KoraColors.ivory,
    ),
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        color: KoraColors.ivory,
        fontSize: 24,
        fontWeight: FontWeight.w700,
        height: 1.2,
      ),
      titleLarge: TextStyle(
        color: KoraColors.ivory,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        height: 1.25,
      ),
      titleMedium: TextStyle(
        color: KoraColors.ivory,
        fontSize: 16,
        fontWeight: FontWeight.w600,
        height: 1.35,
      ),
      bodyLarge: TextStyle(
        color: KoraColors.ivory,
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.5,
      ),
      bodyMedium: TextStyle(
        color: KoraColors.muted,
        fontSize: 15,
        fontWeight: FontWeight.w400,
        height: 1.4,
      ),
      labelLarge: TextStyle(
        color: KoraColors.ivory,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 1.2,
      ),
      labelSmall: TextStyle(
        color: KoraColors.muted,
        fontSize: 12,
        fontWeight: FontWeight.w600,
        height: 1.4,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: KoraColors.background,
      foregroundColor: KoraColors.ivory,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: const CardThemeData(
      color: KoraColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: Color(0xFF2A292E)),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: Color(0xFF2A292E),
      thickness: 1,
      space: 1,
    ),
    iconTheme: const IconThemeData(color: KoraColors.ivory, size: 24),
    iconButtonTheme: IconButtonThemeData(
      style: ButtonStyle(
        minimumSize: WidgetStateProperty.all(const Size(44, 44)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: KoraColors.ivory,
        minimumSize: const Size(44, 44),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        side: const BorderSide(color: KoraColors.gold),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}
