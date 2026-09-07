import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/kora_colors.dart';

class KoraMaliPhoneField extends StatelessWidget {
  const KoraMaliPhoneField({
    required this.controller,
    this.enabled = true,
    this.errorText,
    this.onChanged,
    super.key,
  });

  final TextEditingController controller;
  final bool enabled;
  final String? errorText;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.phone,
      autofillHints: const <String>[AutofillHints.telephoneNumberNational],
      inputFormatters: <TextInputFormatter>[
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(8),
      ],
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: 'Numéro de téléphone',
        hintText: '70 00 00 00',
        helperText: '8 chiffres, sans le préfixe pays',
        errorText: errorText,
        prefixIcon: const SizedBox(
          width: 68,
          child: Center(
            child: Text(
              '+223',
              style: TextStyle(
                color: KoraColors.ivory,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class KoraOtpField extends StatelessWidget {
  const KoraOtpField({
    required this.controller,
    this.enabled = true,
    this.errorText,
    this.onCompleted,
    super.key,
  });

  final TextEditingController controller;
  final bool enabled;
  final String? errorText;
  final ValueChanged<String>? onCompleted;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      textField: true,
      label: 'Code de vérification à 6 chiffres',
      child: TextField(
        controller: controller,
        enabled: enabled,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        autofillHints: const <String>[AutofillHints.oneTimeCode],
        inputFormatters: <TextInputFormatter>[
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
        onChanged: (value) {
          if (value.length == 6) onCompleted?.call(value);
        },
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          letterSpacing: 10,
          fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
        ),
        decoration: InputDecoration(
          labelText: 'Code reçu par SMS',
          hintText: '000000',
          helperText: 'Le code comporte 6 chiffres',
          errorText: errorText,
          counterText: '',
        ),
      ),
    );
  }
}

class KoraSandboxPaymentMethod extends StatelessWidget {
  const KoraSandboxPaymentMethod({
    required this.selected,
    required this.onSelected,
    super.key,
  });

  final bool selected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Moyen de paiement sandbox de démonstration',
      selected: selected,
      child: Card(
        child: InkWell(
          onTap: () => onSelected(!selected),
          borderRadius: BorderRadius.circular(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: <Widget>[
                  Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    color: selected ? KoraColors.gold : KoraColors.muted,
                  ),
                  const Icon(Icons.account_balance_wallet_outlined),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        Text(
                          'Paiement sandbox',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        Text(
                          'Simulation neutre, aucun débit réel',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
