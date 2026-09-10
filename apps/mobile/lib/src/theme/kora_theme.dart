import 'package:flutter/material.dart';

import 'kora_colors.dart';

abstract final class KoraSpacing {
  static const double xxs = 4;
  static const double xs = 6;
  static const double sm = 8;
  static const double md = 10;
  static const double lg = 12;
  static const double xl = 16;
  static const double xxl = 20;
  static const double xxxl = 24;
}

abstract final class KoraRadii {
  static const double control = 12;
  static const double card = 16;
  static const double artwork = 24;
  static const double pill = 999;
}

abstract final class KoraDimensions {
  static const double interactive = 48;
  static const double phonePrefixWidth = 68;
  static const double paymentMethodMinHeight = 64;
  static const double miniPlayerMinHeight = 72;
  static const double compactArtwork = 80;
  static const double artistAvatarRadius = 18;
  static const double iconXs = 16;
  static const double iconSm = 18;
  static const double iconMd = 20;
  static const double iconLg = 24;
  static const double iconXl = 28;
  static const double iconXxl = 32;
  static const double emptyStateIcon = 48;
  static const double emptyPlayerIcon = 56;
  static const double fullPlayerIcon = 72;
  static const double loadingStroke = 3;
  static const double otpLetterSpacing = 10;
  static const double dividerThickness = 1;
  static const double focusBorderWidth = 2;
}

abstract final class KoraTypography {
  static const double layoutProbeFontSize = 16;
  static const double largeTextLayoutThreshold = 24;
  static const double headlineSmall = 24;
  static const double titleLarge = 20;
  static const double titleMedium = 16;
  static const double bodyLarge = 16;
  static const double bodyMedium = 15;
  static const double labelLarge = 14;
  static const double labelSmall = 12;
  static const double headlineHeight = 1.2;
  static const double titleLargeHeight = 1.25;
  static const double titleMediumHeight = 1.35;
  static const double bodyLargeHeight = 1.5;
  static const double bodyMediumHeight = 1.4;
  static const double labelLargeHeight = 1.2;
  static const double labelSmallHeight = 1.4;
}

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
        fontSize: KoraTypography.headlineSmall,
        fontWeight: FontWeight.w700,
        height: KoraTypography.headlineHeight,
      ),
      titleLarge: TextStyle(
        color: KoraColors.ivory,
        fontSize: KoraTypography.titleLarge,
        fontWeight: FontWeight.w700,
        height: KoraTypography.titleLargeHeight,
      ),
      titleMedium: TextStyle(
        color: KoraColors.ivory,
        fontSize: KoraTypography.titleMedium,
        fontWeight: FontWeight.w600,
        height: KoraTypography.titleMediumHeight,
      ),
      bodyLarge: TextStyle(
        color: KoraColors.ivory,
        fontSize: KoraTypography.bodyLarge,
        fontWeight: FontWeight.w400,
        height: KoraTypography.bodyLargeHeight,
      ),
      bodyMedium: TextStyle(
        color: KoraColors.muted,
        fontSize: KoraTypography.bodyMedium,
        fontWeight: FontWeight.w400,
        height: KoraTypography.bodyMediumHeight,
      ),
      labelLarge: TextStyle(
        color: KoraColors.ivory,
        fontSize: KoraTypography.labelLarge,
        fontWeight: FontWeight.w600,
        height: KoraTypography.labelLargeHeight,
      ),
      labelSmall: TextStyle(
        color: KoraColors.muted,
        fontSize: KoraTypography.labelSmall,
        fontWeight: FontWeight.w600,
        height: KoraTypography.labelSmallHeight,
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
        borderRadius: BorderRadius.all(Radius.circular(KoraRadii.card)),
        side: BorderSide(color: KoraColors.surfaceBorder),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: KoraColors.surfaceBorder,
      thickness: KoraDimensions.dividerThickness,
      space: KoraDimensions.dividerThickness,
    ),
    iconTheme: const IconThemeData(
      color: KoraColors.ivory,
      size: KoraDimensions.iconLg,
    ),
    iconButtonTheme: IconButtonThemeData(
      style: ButtonStyle(
        minimumSize: WidgetStateProperty.all(
          const Size.square(KoraDimensions.interactive),
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: KoraColors.gold,
        foregroundColor: KoraColors.background,
        minimumSize: const Size.square(KoraDimensions.interactive),
        padding: const EdgeInsets.symmetric(
          horizontal: KoraSpacing.xxl,
          vertical: KoraSpacing.lg,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KoraRadii.control),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: KoraColors.ivory,
        minimumSize: const Size.square(KoraDimensions.interactive),
        padding: const EdgeInsets.symmetric(
          horizontal: KoraSpacing.xxl,
          vertical: KoraSpacing.lg,
        ),
        side: const BorderSide(color: KoraColors.gold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KoraRadii.control),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: KoraColors.surface,
      labelStyle: const TextStyle(color: KoraColors.ivory),
      hintStyle: const TextStyle(color: KoraColors.muted),
      helperStyle: const TextStyle(color: KoraColors.muted),
      contentPadding: const EdgeInsets.all(KoraSpacing.xl),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(KoraRadii.control),
        borderSide: const BorderSide(color: KoraColors.controlBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(KoraRadii.control),
        borderSide: const BorderSide(color: KoraColors.controlBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(KoraRadii.control),
        borderSide: const BorderSide(
          color: KoraColors.gold,
          width: KoraDimensions.focusBorderWidth,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(KoraRadii.control),
        borderSide: const BorderSide(
          color: KoraColors.error,
          width: KoraDimensions.focusBorderWidth,
        ),
      ),
    ),
  );
}
