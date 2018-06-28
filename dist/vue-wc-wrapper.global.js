var wrapVueWebComponent = (function () {
  'use strict'

  var camelizeRE = /-(\w)/g
  var camelize = function (str) {
    return str.replace(camelizeRE, function (_, c) {
      return c ? c.toUpperCase() : ''
    })
  }
  var hyphenateRE = /\B([A-Z])/g
  var hyphenate = function (str) {
    return str.replace(hyphenateRE, '-$1').toLowerCase()
  }
  function getInitialProps (propsList) {
    var res = {}
    propsList.forEach(function (key) {
      res[key] = undefined
    })
    return res
  }
  function injectHook (options, key, hook) {
    options[key] = [].concat(options[key] || [])
    options[key].unshift(hook)
  }
  function callHooks (vm, hook) {
    if (vm) {
      var hooks = vm.$options[hook] || []
      hooks.forEach(function (hook) {
        hook.call(vm)
      })
    }
  }
  function createCustomEvent (name, args) {
    return new CustomEvent(name, {
      bubbles: false,
      cancelable: false,
      detail: args
    })
  }

  var isBoolean = function (val) {
    return /function Boolean/.test(String(val))
  }

  var isNumber = function (val) {
    return /function Number/.test(String(val))
  }

  function convertAttributeValue (value, name, {
    type
  } = {}) {
    if (isBoolean(type)) {
      if (value === 'true' || value === 'false') {
        return value === 'true'
      }

      if (value === '' || value === name) {
        return true
      }

      return value != null
    } else if (isNumber(type)) {
      var parsed = parseFloat(value, 10)
      return isNaN(parsed) ? value : parsed
    } else {
      return value
    }
  }
  function toVNodes (h, children) {
    var res = []

    for (var i = 0, l = children.length; i < l; i++) {
      res.push(toVNode(h, children[i]))
    }

    return res
  }

  function toVNode (h, node) {
    if (node.nodeType === 3) {
      return node.data.trim() ? node.data : null
    } else if (node.nodeType === 1) {
      var data = {
        attrs: getAttributes(node),
        domProps: {
          innerHTML: node.innerHTML
        }
      }

      if (data.attrs.slot) {
        data.slot = data.attrs.slot
        delete data.attrs.slot
      }

      return h(node.tagName, data)
    } else {
      return null
    }
  }

  function getAttributes (node) {
    var res = {}

    for (var i = 0, l = node.attributes.length; i < l; i++) {
      var attr = node.attributes[i]
      res[attr.nodeName] = attr.nodeValue
    }

    return res
  }

  function wrap (Vue, Component) {
    var isAsync = typeof Component === 'function' && !Component.cid
    var isInitialized = false
    var hyphenatedPropsList
    var camelizedPropsList
    var camelizedPropsMap

    function initialize (Component) {
      if (isInitialized) return
      var options = typeof Component === 'function' ? Component.options : Component // extract props info

      var propsList = Array.isArray(options.props) ? options.props : Object.keys(options.props || {})
      hyphenatedPropsList = propsList.map(hyphenate)
      camelizedPropsList = propsList.map(camelize)
      var originalPropsAsObject = Array.isArray(options.props) ? {} : options.props || {}
      camelizedPropsMap = camelizedPropsList.reduce(function (map, key, i) {
        map[key] = originalPropsAsObject[propsList[i]]
        return map
      }, {}) // proxy $emit to native DOM events

      injectHook(options, 'beforeCreate', function () {
        var emit = this.$emit
        var vue = this

        this.$emit = function () {
          var args = Array.from(arguments)
          var eventName = args.shift()
          var value = Array.from(args)

          if (value.length <= 1) {
            value = value[0]
          }

          var propName

          if (options && options.model && eventName === options.model.event && options.model.prop) {
            propName = options.model.prop
          } else if (/^onChange/.test(eventName)) {
            propName = eventName.replace(/^onChange/, '')
            propName = propName.charAt(0).toLowerCase() + propName.slice(1)
          } else if (eventName === 'input') {
            propName = 'value'
          }

          if (propName) {
            vue.$root.$options.customElement[propName] = value
          }

          vue.$root.$options.customElement.dispatchEvent(createCustomEvent(eventName, args))
          return emit.apply(vue, [name].concat(args))
        }
      })
      injectHook(options, 'created', function () {
        var _this = this

        // sync default props values to wrapper on created
        camelizedPropsList.forEach(function (key) {
          _this.$root.props[key] = _this[key]
        })
      }) // proxy props as Element properties

      camelizedPropsList.forEach(function (key) {
        Object.defineProperty(CustomElement.prototype, key, {
          get () {
            return this._wrapper.props[key]
          },

          set (newVal) {
            if (this[key] !== newVal) {
              this._wrapper.props[key] = newVal
            }
          },

          enumerable: false,
          configurable: true
        })
      })
      isInitialized = true
    }

    function syncAttribute (el, key) {
      var camelized = camelize(key)
      var value = el.hasAttribute(key) ? el.getAttribute(key) : undefined
      el._wrapper.props[camelized] = convertAttributeValue(value, key, camelizedPropsMap[camelized])
    }

    class CustomElement extends HTMLElement {
      constructor () {
        var _this2

        _this2 = super()
        this.attachShadow({
          mode: 'open'
        })
        var wrapper = this._wrapper = new Vue({
          name: 'shadow-root',
          customElement: this,
          shadowRoot: this.shadowRoot,

          data () {
            return {
              props: {},
              slotChildren: []
            }
          },

          render (h) {
            return h(Component, {
              ref: 'inner',
              props: this.props
            }, this.slotChildren)
          }

        }) // Use MutationObserver to react to future attribute & slot content change

        var observer = new MutationObserver(function (mutations) {
          var hasChildrenChange = false

          for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i]

            if (isInitialized && m.type === 'attributes' && m.target === _this2) {
              syncAttribute(_this2, m.attributeName)
            } else {
              hasChildrenChange = true
            }
          }

          if (hasChildrenChange) {
            wrapper.slotChildren = Object.freeze(toVNodes(wrapper.$createElement, _this2.childNodes))
          }
        })
        observer.observe(this, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true
        })
      }

      get vueComponent () {
        return this._wrapper.$refs.inner
      }

      connectedCallback () {
        var _this3 = this

        var wrapper = this._wrapper

        if (!wrapper._isMounted) {
        // initialize attributes
          var syncInitialAttributes = function () {
            wrapper.props = getInitialProps(camelizedPropsList)
            hyphenatedPropsList.forEach(function (key) {
              syncAttribute(_this3, key)
            })
          }

          if (isInitialized) {
            syncInitialAttributes()
          } else {
          // async & unresolved
            Component().then(function (resolved) {
              if (resolved.__esModule || resolved[Symbol.toStringTag] === 'Module') {
                resolved = resolved.default
              }

              initialize(resolved)
              syncInitialAttributes()
            })
          } // initialize children

          wrapper.slotChildren = Object.freeze(toVNodes(wrapper.$createElement, this.childNodes))
          wrapper.$mount()
          this.shadowRoot.appendChild(wrapper.$el)
        } else {
          callHooks(this.vueComponent, 'activated')
        }
      }

      disconnectedCallback () {
        callHooks(this.vueComponent, 'deactivated')
      }
    }

    if (!isAsync) {
      initialize(Component)
    }

    return CustomElement
  }

  return wrap
}())
