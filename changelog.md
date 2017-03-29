# 3.6.0

* better documentation on relationships
* relationship functions must return arrays, see [relationships summary](readme.md#relationships-summary).
* relationship functions are now always executed _after_ the parent entity is saved
* oracle driver now formats rows using [cooperative](https://github.com/featurist/cooperative) so your app stays responsive for high values of `maxRows`.

# 3.5.0

* websql driver thanks to [@dereke](https://github.com/dereke)

  We can now run sworm in the browser (!), using the browser's native Web SQL implementation.
