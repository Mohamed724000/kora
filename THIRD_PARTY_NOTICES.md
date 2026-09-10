# KORA+ — Third-party notices

This file records attributions that must accompany relevant distributions.
It is not a replacement for the complete license texts shipped by third-party
packages.

## Can I Use data

Browser compatibility data is sourced from
[caniuse.com](https://caniuse.com/), created and maintained by Alexis Deveria,
and is provided under the
[Creative Commons Attribution 4.0 International license](https://creativecommons.org/licenses/by/4.0/).

KORA+ receives a compact representation of this data through
[`caniuse-lite`](https://github.com/browserslist/caniuse-lite), whose installed
package manifest identifies Ben Briggs as the package author. KORA+ does not
modify the upstream compatibility data.

## Sharp/libvips Linux x64 binaries

The Linux x64 installation of `sharp@0.35.4` can select the optional native
packages `@img/sharp-libvips-linux-x64@1.3.3` (glibc) or
`@img/sharp-libvips-linuxmusl-x64@1.3.3` (musl). Their package manifests declare
`LGPL-3.0-or-later`. KORA+ does not modify these third-party libraries.

The upstream image-processing library is [libvips](https://github.com/libvips/libvips),
and the applicable GNU LGPL text is available from the
[GNU Project](https://www.gnu.org/licenses/lgpl-3.0.html). Any distributed
server artifact that contains one of these native libraries must preserve the
applicable license and notices and pass the separate KORA+ legal/release gate.
This notice is not a general approval of LGPL dependencies or a release
authorization.
